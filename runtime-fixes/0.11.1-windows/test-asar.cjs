'use strict';
// Standalone stdlib regression tests. Run remotely with: node --test test-asar.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const api = require('./patch-asar.cjs');
const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const changedPaths = ['plugins/deliverables.js', 'plugins/documentpreview.js', 'plugins/session-controller.js'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function addEntry(header, name, entry) {
  const parts = name.split('/');
  let parent = header;
  for (const part of parts.slice(0, -1)) {
    parent.files[part] ??= { files: {} };
    parent = parent.files[part];
  }
  parent.files[parts.at(-1)] = entry;
}
function fakeExe(wire = '101100011', version = 1, declaredLength = wire.length) {
  return Buffer.concat([Buffer.from('MZ synthetic fixture\0'), sentinel, Buffer.from([version, declaredLength]), Buffer.from(wire)]);
}
function fixture(t) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'dsh-asar-test-'));
  t.after(() => {
    const resolved = path.resolve(dir);
    const relative = path.relative(tempRoot, resolved);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert.match(path.basename(resolved), /^dsh-asar-test-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const originals = new Map([
    ['package.json', Buffer.from(JSON.stringify({ name: 'fixture-desktop', version: '0.11.1' }))],
    ['node_modules/@deepseek-ai/dsh/package.json', Buffer.from(JSON.stringify({ version: 'fixture-1' }))],
    ['assets/unchanged.bin', Buffer.from([0, 1, 127, 128, 254, 255])],
    ...changedPaths.map((name, i) => [name, Buffer.from(`original ${i}: 中文\n`)])
  ]);
  const header = { files: {} }, payload = [];
  let offset = 0;
  for (const [name, bytes] of originals) {
    addEntry(header, name, { size: bytes.length, offset: String(offset), integrity: api.integrity(bytes) });
    offset += bytes.length;
    payload.push(bytes);
  }
  addEntry(header, 'native/addon.node', { size: 17, unpacked: true, executable: true, integrity: api.integrity(Buffer.alloc(17, 2)) });
  addEntry(header, 'asset-link', { link: 'assets/unchanged.bin' });
  const original = Buffer.concat([api.serializeHeader(header), ...payload]);
  const replacements = changedPaths.map((name, i) => [name, Buffer.from(`modified ${i}: Windows 路径 C:\\项目\\file${i}.mp4\n${'x'.repeat(i * 13)}`)]);
  const manifest = {
    desktopVersion: '0.11.1', harnessVersion: 'fixture-1',
    baselineAsarSha256: sha(original), baselineExeSha256: sha(fakeExe()),
    files: replacements.map(([name, bytes], i) => ({
      path: name, file: `overlay-${i}.js`, baselineSha256: sha(originals.get(name)), modifiedSha256: sha(bytes)
    }))
  };
  for (const item of manifest.files) fs.writeFileSync(path.join(dir, item.file), replacements.find(([name]) => name === item.path)[1]);
  fs.writeFileSync(path.join(dir, 'original.asar'), original);
  fs.writeFileSync(path.join(dir, 'fixture.exe'), fakeExe());
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return { dir, header, original, originals, replacements, manifest, candidate: api.buildBuffer(original, replacements) };
}
function candidateWithHeader(candidate, mutate) {
  const parsed = api.parseAsar(candidate);
  const header = structuredClone(parsed.header);
  mutate(header);
  return Buffer.concat([api.serializeHeader(header), candidate.subarray(parsed.payloadStart)]);
}
function cli(f, mode = 'build', extra = []) {
  return spawnSync(process.execPath, [path.join(__dirname, 'patch-asar.cjs'), mode,
    '--dir', f.dir, '--asar', path.join(f.dir, 'original.asar'), '--exe', path.join(f.dir, 'fixture.exe'),
    ...(mode === 'build' ? ['--output', path.join(f.dir, 'candidate.asar')] : ['--candidate', path.join(f.dir, 'candidate.asar')]),
    ...extra], { encoding: 'utf8', windowsHide: true });
}

test('serializeHeader round-trips UTF-8 JSON and four-byte Pickle alignment', () => {
  for (const text of ['', 'a', 'ab', 'abc', '中文 C:\\项目\\file.mp4']) {
    const header = { files: {}, text };
    const buffer = api.serializeHeader(header);
    const raw = Buffer.from(JSON.stringify(header));
    assert.equal(buffer.readUInt32LE(0), 4);
    assert.equal(buffer.readUInt32LE(4), buffer.length - 8);
    assert.equal(buffer.readUInt32LE(8), buffer.length - 12);
    assert.equal(buffer.readUInt32LE(12), raw.length);
    assert.equal(buffer.length % 4, 0);
    assert.ok(buffer.subarray(16, 16 + raw.length).equals(raw));
    assert.ok(buffer.subarray(16 + raw.length).every(value => value === 0));
    assert.deepEqual(api.parseAsar(buffer).header, header);
  }
});

test('append overlay preserves original payload and all packed/unpacked/link metadata except three entries', t => {
  const f = fixture(t), before = api.parseAsar(f.original), after = api.parseAsar(f.candidate);
  const oldPayload = f.original.subarray(before.payloadStart);
  assert.ok(f.candidate.subarray(after.payloadStart, after.payloadStart + oldPayload.length).equals(oldPayload));
  assert.deepEqual(api.entryFor(after.header, 'native/addon.node'), api.entryFor(before.header, 'native/addon.node'));
  assert.deepEqual(api.entryFor(after.header, 'asset-link'), api.entryFor(before.header, 'asset-link'));
  for (const [name, bytes] of f.originals) {
    if (changedPaths.includes(name)) continue;
    assert.deepEqual(api.entryFor(after.header, name), api.entryFor(before.header, name));
    assert.ok(api.contentFor(f.candidate, after, name).equals(bytes));
  }
  let offset = oldPayload.length;
  for (const [name, bytes] of f.replacements) {
    const entry = api.entryFor(after.header, name);
    assert.equal(entry.offset, String(offset));
    assert.equal(entry.size, bytes.length);
    assert.equal(entry.integrity.hash, sha(bytes));
    assert.deepEqual(entry.integrity, api.integrity(bytes));
    assert.ok(api.contentFor(f.candidate, after, name).equals(bytes));
    offset += bytes.length;
  }
  assert.equal(f.candidate.length, after.payloadStart + offset);
  const record = api.verifyBuffer(f.original, f.candidate, f.manifest, f.dir);
  assert.equal(record.exitStatus, 0);
  assert.equal(record.originalPayloadPreserved, true);
  assert.equal(record.changedEntries.length, 3);
  assert.equal(record.originalSha256, sha(f.original));
  assert.equal(record.candidateSha256, sha(f.candidate));
});

test('file and block integrity cover empty, partial, exact and cross-block buffers', () => {
  const blockSize = 4 * 1024 * 1024;
  for (const size of [0, 1, blockSize - 1, blockSize, blockSize + 1]) {
    const bytes = Buffer.alloc(size, 0xa5), result = api.integrity(bytes);
    const expected = [];
    for (let i = 0; i < size; i += blockSize) expected.push(sha(bytes.subarray(i, i + blockSize)));
    if (!size) expected.push(sha(Buffer.alloc(0)));
    assert.equal(result.algorithm, 'SHA256');
    assert.equal(result.hash, sha(bytes));
    assert.equal(result.blockSize, blockSize);
    assert.deepEqual(result.blocks, expected);
  }
});

test('tampered original-payload bytes and replacement bytes are rejected', t => {
  const f = fixture(t), parsed = api.parseAsar(f.candidate);
  const originalTamper = Buffer.from(f.candidate);
  originalTamper[parsed.payloadStart] ^= 1;
  assert.throws(() => api.verifyBuffer(f.original, originalTamper, f.manifest, f.dir), /Original payload bytes changed/);
  const replacementTamper = Buffer.from(f.candidate);
  const changed = api.entryFor(parsed.header, changedPaths[0]);
  replacementTamper[parsed.payloadStart + Number(changed.offset)] ^= 1;
  assert.throws(() => api.verifyBuffer(f.original, replacementTamper, f.manifest, f.dir), /Candidate bytes mismatch/);
});

test('unexpected trailing data, metadata changes and stale integrity are rejected', t => {
  const f = fixture(t);
  assert.throws(() => api.verifyBuffer(f.original, Buffer.concat([f.candidate, Buffer.from('unexpected')]), f.manifest, f.dir), /Unexpected candidate trailing data/);
  for (const mutate of [
    header => { api.entryFor(header, 'native/addon.node').size++; },
    header => { header.files.unexpected = { size: 0, offset: '0' }; },
    header => { api.entryFor(header, changedPaths[0]).integrity.hash = '0'.repeat(64); },
    header => { api.entryFor(header, changedPaths[1]).integrity.blocks[0] = 'f'.repeat(64); }
  ]) assert.throws(() => api.verifyBuffer(f.original, candidateWithHeader(f.candidate, mutate), f.manifest, f.dir), /Unexpected ASAR metadata change/);
});

test('manifest baseline and modified hashes are enforced', t => {
  const f = fixture(t), baseline = structuredClone(f.manifest), modified = structuredClone(f.manifest);
  baseline.files[1].baselineSha256 = '0'.repeat(64);
  modified.files[1].modifiedSha256 = '0'.repeat(64);
  assert.throws(() => api.verifyBuffer(f.original, f.candidate, baseline, f.dir), /Baseline hash mismatch/);
  assert.throws(() => api.verifyBuffer(f.original, f.candidate, modified, f.dir), /Overlay hash mismatch/);
  fs.appendFileSync(path.join(f.dir, f.manifest.files[2].file), 'tamper');
  assert.throws(() => api.verifyBuffer(f.original, f.candidate, f.manifest, f.dir), /Overlay hash mismatch/);
});

test('unpacked, link, missing and malformed archive entries are rejected', t => {
  const f = fixture(t), parsed = api.parseAsar(f.original);
  for (const name of ['native/addon.node', 'asset-link']) {
    assert.throws(() => api.contentFor(f.original, parsed, name), /Expected packed file/);
    assert.throws(() => api.buildBuffer(f.original, [[name, Buffer.from('replacement')]]), /Expected packed replacement/);
  }
  assert.throws(() => api.entryFor(parsed.header, 'plugins/missing.js'), /Missing ASAR entry/);
  const bad = { header: structuredClone(parsed.header), payloadStart: parsed.payloadStart };
  api.entryFor(bad.header, changedPaths[0]).offset = '9007199254740992';
  assert.throws(() => api.contentFor(f.original, bad, changedPaths[0]), /Invalid entry bounds/);
  assert.throws(() => api.parseAsar(Buffer.alloc(15)), /Invalid ASAR prefix/);
  const prefix = Buffer.alloc(16); prefix.writeUInt32LE(4, 0); prefix.writeUInt32LE(99999, 4);
  assert.throws(() => api.parseAsar(prefix), /Invalid ASAR header bounds/);
});

test('Electron fuse reader preserves known wire and rejects missing, duplicate, truncated, unknown and future wires', () => {
  const exe = fakeExe(), saved = Buffer.from(exe), result = api.readFuses(exe);
  assert.equal(result.version, 1);
  assert.equal(result.wire, '101100011');
  assert.equal(result.runAsNode, true);
  assert.equal(result.embeddedIntegrity, false);
  assert.equal(result.onlyAsar, false);
  assert.ok(exe.equals(saved));
  for (const invalid of [Buffer.from('not Electron'), Buffer.concat([exe, exe]), fakeExe('101100011', 2), fakeExe('10110', 1, 9), fakeExe('1011?0011')]) {
    assert.throws(() => api.readFuses(invalid), /fuse|Fuse/);
  }
});

test('CLI build and verify read back candidate, preserve baseline and executable, and prevent overwrite', t => {
  const f = fixture(t), original = fs.readFileSync(path.join(f.dir, 'original.asar')), exe = fs.readFileSync(path.join(f.dir, 'fixture.exe'));
  const built = cli(f);
  assert.equal(built.status, 0, built.stderr);
  const record = JSON.parse(built.stdout);
  assert.equal(record.originalSha256, sha(original));
  assert.equal(record.changedEntries.length, 3);
  assert.equal(record.fuses.wire, '101100011');
  assert.equal(record.candidateSha256, sha(fs.readFileSync(path.join(f.dir, 'candidate.asar'))));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, 'candidate.asar.verification.json'), 'utf8')), record);
  const verified = cli(f, 'verify');
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).candidateSha256, record.candidateSha256);
  assert.ok(fs.readFileSync(path.join(f.dir, 'original.asar')).equals(original));
  assert.ok(fs.readFileSync(path.join(f.dir, 'fixture.exe')).equals(exe));
  assert.equal(cli(f).status, 1);
  const inPlace = cli(f, 'build', ['--output', path.join(f.dir, 'original.asar')]);
  assert.equal(inPlace.status, 1);
  assert.match(inPlace.stderr, /separate from the original/);
  assert.ok(fs.readFileSync(path.join(f.dir, 'original.asar')).equals(original));
});

test('CLI rejects unpinned archive, executable and Desktop/Harness versions before publishing output', t => {
  const f = fixture(t);
  const checks = [
    [manifest => { manifest.baselineAsarSha256 = '0'.repeat(64); }, /pinned Windows/],
    [manifest => { manifest.baselineExeSha256 = '0'.repeat(64); }, /executable is not/],
    [manifest => { manifest.desktopVersion = '0.12.0'; }, /version mismatch/],
    [manifest => { manifest.harnessVersion = 'future'; }, /version mismatch/]
  ];
  for (const [mutate, message] of checks) {
    const manifest = structuredClone(f.manifest); mutate(manifest);
    fs.writeFileSync(path.join(f.dir, 'manifest.json'), JSON.stringify(manifest));
    const result = cli(f);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.equal(fs.existsSync(path.join(f.dir, 'candidate.asar')), false);
  }
});

test('CLI rejects enabled or removed embedded-integrity fuse without writing candidate or changing executable', t => {
  const f = fixture(t);
  for (const wire of ['101110011', '1011r0011']) {
    const exe = fakeExe(wire), manifest = { ...f.manifest, baselineExeSha256: sha(exe) };
    fs.writeFileSync(path.join(f.dir, 'fixture.exe'), exe);
    fs.writeFileSync(path.join(f.dir, 'manifest.json'), JSON.stringify(manifest));
    const result = cli(f);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /integrity|Integrity/);
    assert.equal(fs.existsSync(path.join(f.dir, 'candidate.asar')), false);
    assert.ok(fs.readFileSync(path.join(f.dir, 'fixture.exe')).equals(exe));
  }
});
