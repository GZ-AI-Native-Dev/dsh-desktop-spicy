'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
function parseAsar(buffer) {
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) throw Error('Invalid ASAR prefix');
  const headerSize = buffer.readUInt32LE(4), jsonSize = buffer.readUInt32LE(12);
  if (headerSize < 8 || 8 + headerSize > buffer.length || jsonSize > headerSize - 8 || buffer.readUInt32LE(8) !== headerSize - 4) throw Error('Invalid ASAR header bounds');
  return {header: JSON.parse(buffer.subarray(16, 16 + jsonSize).toString('utf8')), payloadStart: 8 + headerSize, jsonSize};
}
function entryFor(header, name) {
  let e = header;
  for (const part of name.split('/')) {
    if (!part || part === '..' || !e.files?.[part]) throw Error(`Missing ASAR entry: ${name}`);
    e = e.files[part];
  }
  return e;
}
function contentFor(buffer, parsed, name) {
  const e = entryFor(parsed.header, name);
  if (e.unpacked || e.link || !Number.isSafeInteger(e.size)) throw Error(`Expected packed file: ${name}`);
  const offset = Number(e.offset), start = parsed.payloadStart + offset;
  if (!Number.isSafeInteger(offset) || offset < 0 || e.size < 0 || start + e.size > buffer.length) throw Error('Invalid entry bounds');
  return buffer.subarray(start, start + e.size);
}
function integrity(content, blockSize = 4 * 1024 * 1024) {
  if (!Number.isSafeInteger(blockSize) || blockSize < 1) throw Error('Invalid integrity block size');
  const blocks = [];
  for (let i = 0; i < content.length; i += blockSize) blocks.push(hash(content.subarray(i, i + blockSize)));
  if (!content.length) blocks.push(hash(Buffer.alloc(0)));
  return {algorithm: 'SHA256', hash: hash(content), blockSize, blocks};
}
function serializeHeader(header) {
  const raw = Buffer.from(JSON.stringify(header), 'utf8');
  const padded = (raw.length + 3) & ~3;
  const prefix = Buffer.alloc(16 + padded);
  prefix.writeUInt32LE(4, 0); prefix.writeUInt32LE(8 + padded, 4);
  prefix.writeUInt32LE(4 + padded, 8); prefix.writeUInt32LE(raw.length, 12);
  raw.copy(prefix, 16);
  return prefix;
}
function readFuses(exe) {
  const p = exe.indexOf(sentinel);
  if (p < 0 || exe.indexOf(sentinel, p + 1) >= 0) throw Error('Expected one Electron fuse wire');
  const version = exe[p + sentinel.length], length = exe[p + sentinel.length + 1];
  const wire = exe.subarray(p + sentinel.length + 2, p + sentinel.length + 2 + length).toString('ascii');
  if (version !== 1 || wire.length !== length || length < 6 || !/^[01r]+$/.test(wire)) throw Error('Unexpected Electron fuse format');
  if (wire[4] !== '0') throw Error('Embedded ASAR integrity requires a normal rebuilt and signed application');
  return {version, wire, runAsNode: wire[0] === '1', embeddedIntegrity: wire[4] === '1', onlyAsar: wire[5] === '1'};
}
function buildBuffer(original, replacements) {
  const parsed = parseAsar(original);
  const header = structuredClone(parsed.header), payload = original.subarray(parsed.payloadStart);
  const appended = [];
  let offset = payload.length;
  for (const [name, content] of replacements) {
    const entry = entryFor(header, name);
    if (entry.unpacked || entry.link) throw Error(`Expected packed replacement: ${name}`);
    entry.size = content.length; entry.offset = String(offset);
    entry.integrity = integrity(content, entry.integrity?.blockSize || 4 * 1024 * 1024);
    offset += content.length; appended.push(content);
  }
  return Buffer.concat([serializeHeader(header), payload, ...appended]);
}
function verifyBuffer(original, candidate, manifest, payloadDir) {
  const before = parseAsar(original), after = parseAsar(candidate);
  const oldPayload = original.subarray(before.payloadStart);
  if (!candidate.subarray(after.payloadStart, after.payloadStart + oldPayload.length).equals(oldPayload)) throw Error('Original payload bytes changed');
  const expected = structuredClone(before.header), changed = [];
  let offset = oldPayload.length;
  for (const item of manifest.files) {
    const content = fs.readFileSync(path.join(payloadDir, item.file));
    if (hash(content) !== item.modifiedSha256) throw Error(`Overlay hash mismatch: ${item.file}`);
    if (hash(contentFor(original, before, item.path)) !== item.baselineSha256) throw Error(`Baseline hash mismatch: ${item.path}`);
    const e = entryFor(expected, item.path);
    e.size = content.length; e.offset = String(offset); e.integrity = integrity(content, e.integrity?.blockSize || 4 * 1024 * 1024);
    offset += content.length;
    if (!contentFor(candidate, after, item.path).equals(content)) throw Error(`Candidate bytes mismatch: ${item.path}`);
    changed.push({path: item.path, before: item.baselineSha256, after: item.modifiedSha256});
  }
  if (JSON.stringify(expected) !== JSON.stringify(after.header)) throw Error('Unexpected ASAR metadata change');
  if (candidate.length !== after.payloadStart + offset) throw Error('Unexpected candidate trailing data');
  return {originalSha256: hash(original), candidateSha256: hash(candidate), originalPayloadPreserved: true, changedEntries: changed, exitStatus: 0};
}
function args(argv) {
  const result = {mode: argv[0]};
  for (let i = 1; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || argv[i + 1] === undefined) throw Error('Expected --name value arguments');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}
function main(argv) {
  const a = args(argv), dir = path.resolve(a.dir || __dirname);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const originalPath = path.resolve(a.asar), original = fs.readFileSync(originalPath);
  if (hash(original) !== manifest.baselineAsarSha256) throw Error('This overlay requires the pinned Windows 0.11.1 ASAR');
  const parsed = parseAsar(original);
  const pkg = JSON.parse(contentFor(original, parsed, 'package.json'));
  const harness = JSON.parse(contentFor(original, parsed, 'node_modules/@deepseek-ai/dsh/package.json'));
  if (pkg.version !== manifest.desktopVersion || harness.version !== manifest.harnessVersion) throw Error('Desktop/Harness version mismatch');
  let fuses;
  if (a.exe) {
    const exe = fs.readFileSync(a.exe);
    if (hash(exe) !== manifest.baselineExeSha256) throw Error('Desktop executable is not the pinned Windows build');
    fuses = readFuses(exe);
    if (fuses.embeddedIntegrity) throw Error('Embedded ASAR integrity requires a normal rebuilt and signed application');
  }
  if (a.mode === 'build') {
    const target = path.resolve(a.output);
    if (target.toLowerCase() === originalPath.toLowerCase()) throw Error('Build output must be separate from the original');
    const replacements = manifest.files.map(item => [item.path, fs.readFileSync(path.join(dir, item.file))]);
    const candidate = buildBuffer(original, replacements);
    const result = verifyBuffer(original, candidate, manifest, dir);
    fs.writeFileSync(target, candidate, {flag: 'wx'});
    if (hash(fs.readFileSync(target)) !== result.candidateSha256) throw Error('Candidate readback mismatch');
    const record = {...result, fuses, desktopVersion: pkg.version, harnessVersion: harness.version, output: target};
    fs.writeFileSync(target + '.verification.json', JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record));
  } else if (a.mode === 'verify') {
    console.log(JSON.stringify({...verifyBuffer(original, fs.readFileSync(a.candidate), manifest, dir), fuses}));
  } else throw Error('Choose build or verify');
}
module.exports = {hash, parseAsar, entryFor, contentFor, integrity, serializeHeader, readFuses, buildBuffer, verifyBuffer};
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; } }
