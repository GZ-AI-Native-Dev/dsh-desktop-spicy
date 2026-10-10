const { readFileSync } = require('node:fs');
const { join, posix, win32 } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Extract only the authenticated handler, keeping the regression suite dependency-free.
const source = readFileSync(join(__dirname, 'session-controller.js'), 'utf8');
const start = source.indexOf('function isMediaStreamAbsolutePath(');
const end = source.indexOf('const SessionMediaReferences =', start);
assert.ok(start > 0 && end > start);
class FsError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const BASE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "sandbox; default-src 'none'"
};
function extract(nativeIsAbsolute = posix.isAbsolute, lookup = () => 'video/mp4') {
  return new Function('mime', 'isAbsolute', 'BASE_HEADERS', 'FsError',
    `${source.slice(start, end)}; return { serve: serveMediaStream, absolute: isMediaStreamAbsolutePath };`)(
      { lookup }, nativeIsAbsolute, BASE_HEADERS, FsError
    );
}
const { serve } = extract();
const data = new TextEncoder().encode('0123456789');
const request = (range = null, method = 'GET', path = '/video.mp4', signal) =>
  new Request(`http://localhost/api/file-stream?path=${encodeURIComponent(path)}`, {
    method,
    ...(range !== null ? { headers: { Range: range } } : {}),
    ...(signal ? { signal } : {})
  });

function fixture(bytes = data, overrides = {}) {
  const target = { displayPath: '/video.mp4', targetKey: 'opaque-policy-checked-target' };
  const calls = { resolve: [], stat: [], reads: [], wholeReads: [] };
  const fs = {
    async resolve(path, options) {
      calls.resolve.push([path, options]);
      target.displayPath = path;
      return target;
    },
    async stat(actual, signal) {
      assert.equal(actual, target);
      calls.stat.push(signal);
      return { type: 'file', size: bytes.length };
    },
    async readByteRange(actual, { offset, length }, signal) {
      assert.equal(actual, target);
      assert.ok(signal instanceof AbortSignal);
      assert.ok(length > 0 && length <= 1024 * 1024);
      calls.reads.push([offset, length, signal]);
      return bytes.slice(offset, offset + length);
    },
    async readBytes(actual, signal, maxBytes) {
      assert.equal(actual, target);
      calls.wholeReads.push([signal, maxBytes]);
      if (bytes.length > maxBytes) throw new FsError('FS_TOO_LARGE');
      return bytes;
    },
    ...overrides
  };
  return { fs, calls, target };
}

test('absolute path detection is identical with POSIX and Windows host path implementations', async () => {
  const accepted = [
    '/tmp/spaces and 视频 #?%.mp4', 'C:\\Users\\User Name\\视频 #?%.mp4',
    'd:/Media/文件 name.mp4', '\\\\server\\share\\Folder Name\\视频.mp4',
    '\\\\server\\share', '\\\\?\\C:\\Media\\video.mp4',
    '\\\\?\\UNC\\server\\share\\video.mp4'
  ];
  const rejected = [
    'relative.mp4', 'C:relative.mp4', '\\relative.mp4', '\\\\server',
    '\\\\?\\C:relative.mp4', '\\\\.\\NUL', 'file:///C:/Media/video.mp4'
  ];
  // Linux native isAbsolute rejects a drive path; the execution-world detector must not.
  assert.equal(posix.isAbsolute(accepted[1]), false);
  assert.equal(win32.isAbsolute(accepted[1]), true);
  for (const native of [posix.isAbsolute, win32.isAbsolute]) {
    const handler = extract(native);
    for (const path of accepted) {
      assert.equal(handler.absolute(path), true, path);
      const { fs, calls } = fixture();
      const req = request(null, 'GET', path);
      const response = await handler.serve(req, fs);
      assert.equal(response.status, 200, path);
      assert.equal(await response.text(), '0123456789');
      assert.equal(calls.resolve[0][0], path, 'provider receives the unmodified decoded path');
      assert.equal(calls.resolve[0][1].signal, req.signal);
      assert.equal(calls.stat[0], req.signal);
    }
    for (const path of rejected) {
      assert.equal(handler.absolute(path), false, path);
      const { fs, calls } = fixture();
      assert.equal((await handler.serve(request(null, 'GET', path), fs)).status, 400, path);
      assert.equal(calls.resolve.length, 0);
    }
  }
});

test('full response has security headers and reads only on demand', async () => {
  const { fs, calls } = fixture();
  const response = await serve(request(), fs);
  assert.equal(response.status, 200);
  for (const [key, value] of Object.entries(BASE_HEADERS)) assert.equal(response.headers.get(key), value);
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.equal(response.headers.get('Content-Type'), 'video/mp4');
  assert.equal(response.headers.get('Content-Range'), null);
  assert.equal(calls.reads.length, 0);
  assert.equal(await response.text(), '0123456789');
  assert.deepEqual(calls.reads.map(([offset, length]) => [offset, length]), [[0, 10]]);
  assert.equal(calls.wholeReads.length, 0);
});

test('unknown MIME falls back to octet-stream', async () => {
  const response = await extract(posix.isAbsolute, () => false).serve(request(), fixture().fs);
  assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
  await response.body.cancel();
});

test('single, suffix, open-ended, clamped and uppercase ranges', async () => {
  for (const [range, text, contentRange] of [
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=8-99', '89', 'bytes 8-9/10'],
    ['bytes=-99', '0123456789', 'bytes 0-9/10'],
    ['bytes=0-0', '0', 'bytes 0-0/10'],
    ['BYTES=9-9', '9', 'bytes 9-9/10']
  ]) {
    const { fs, calls } = fixture();
    const response = await serve(request(range), fs);
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(response.headers.get('Content-Length'), String(text.length));
    assert.equal(await response.text(), text);
    assert.equal(calls.wholeReads.length, 0);
  }
});

test('invalid, multi-part and unsafe-number ranges reject before reads', async () => {
  for (const range of [
    '', 'bytes=-', 'bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5',
    'bytes=0--1', 'items=0-1', 'bytes=+1-2', 'bytes=1.5-2',
    'bytes=9007199254740992-', 'bytes=0-9007199254740992',
    'bytes=-9007199254740992', `bytes=0-${'9'.repeat(400)}`
  ]) {
    const { fs, calls } = fixture();
    const response = await serve(request(range), fs);
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10');
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(calls.reads.length, 0);
  }
});

test('HEAD preserves full, ranged and failure headers without any reads', async () => {
  for (const [range, status, length] of [[null, 200, '10'], ['bytes=2-5', 206, '4'], ['bytes=10-', 416, null]]) {
    const { fs, calls } = fixture();
    const response = await serve(request(range, 'HEAD'), fs);
    assert.equal(response.status, status);
    assert.equal(response.body, null);
    assert.equal(response.headers.get('Content-Length'), length);
    assert.equal(calls.reads.length, 0);
    assert.equal(calls.wholeReads.length, 0);
  }
  assert.equal((await serve(request(null, 'HEAD', 'relative'), fixture().fs)).body, null);
});

test('large files are read as at most 1 MiB windows, never readBytes', async () => {
  const large = Uint8Array.from({ length: 2 * 1024 * 1024 + 7 }, (_, index) => index % 251);
  const { fs, calls } = fixture(large);
  const response = await serve(request(), fs);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), large);
  assert.deepEqual(calls.reads.map(([offset, length]) => [offset, length]), [
    [0, 1024 * 1024], [1024 * 1024, 1024 * 1024], [2 * 1024 * 1024, 7]
  ]);
  assert.equal(calls.wholeReads.length, 0);
});

test('very large safe file sizes keep ranged offsets exact without allocation', async () => {
  const size = Number.MAX_SAFE_INTEGER;
  const ranges = [];
  const fs = {
    resolve: async (path) => ({ displayPath: path, targetKey: 'opaque' }),
    stat: async () => ({ type: 'file', size }),
    readByteRange: async (_target, range) => { ranges.push(range); return new Uint8Array(range.length); }
  };
  const response = await serve(request(`bytes=${size - 2}-`), fs);
  assert.equal(response.headers.get('Content-Range'), `bytes ${size - 2}-${size - 1}/${size}`);
  assert.equal((await response.arrayBuffer()).byteLength, 2);
  assert.deepEqual(ranges, [{ offset: size - 2, length: 2 }]);
});

test('missing, NUL and relative paths are rejected before touching Fs', async () => {
  const { fs, calls } = fixture();
  const absent = new Request('http://localhost/api/file-stream');
  for (const req of [absent, request(null, 'GET', ''), request(null, 'GET', '/video\0.mp4'), request(null, 'GET', 'video.mp4')]) {
    assert.equal((await serve(req, fs)).status, 400);
  }
  assert.equal(calls.resolve.length, 0);
});

test('missing, directory, empty and invalid-size metadata', async () => {
  assert.equal((await serve(request(), fixture(data, { stat: async () => undefined }).fs)).status, 404);
  assert.equal((await serve(request(), fixture(data, { stat: async () => ({ type: 'directory', size: 10 }) }).fs)).status, 403);
  const emptyFixture = fixture(new Uint8Array());
  const empty = await serve(request(), emptyFixture.fs);
  assert.equal(empty.status, 200);
  assert.equal(empty.body, null);
  assert.equal(empty.headers.get('Content-Length'), '0');
  for (const range of ['bytes=0-', 'bytes=0-0', 'bytes=-1']) {
    const response = await serve(request(range), emptyFixture.fs);
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), 'bytes */0');
  }
  assert.equal(emptyFixture.calls.reads.length, 0);
  for (const size of [undefined, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await serve(request(), fixture(data, { stat: async () => ({ type: 'file', size }) }).fs)).status, 500);
  }
});

test('typed Fs metadata failures retain status mapping and policy enforcement', async () => {
  for (const [code, status] of [
    ['FS_NOT_FOUND', 404], ['FS_NOT_REGULAR_FILE', 403], ['FS_PERMISSION_DENIED', 403],
    ['FS_SANDBOX_DENIED', 403], ['FS_TOO_LARGE', 413], ['FS_ABORTED', 499], ['FS_IO_ERROR', 500]
  ]) {
    for (const phase of ['resolve', 'stat']) {
      const { fs, calls } = fixture(data, { [phase]: async () => { throw new FsError(code); } });
      const response = await serve(request(), fs);
      assert.equal(response.status, status, `${phase}: ${code}`);
      assert.equal(await response.text(), code);
      assert.equal(calls.reads.length, 0);
    }
  }
});

test('native metadata permission errors and unknown errors are distinguished', async () => {
  for (const code of ['EACCES', 'EPERM']) {
    const error = Object.assign(new Error('permission failure'), { code });
    const response = await serve(request(), fixture(data, { stat: async () => { throw error; } }).fs);
    assert.equal(response.status, 403);
    assert.equal(await response.text(), code);
  }
  const error = new Error('unexpected provider failure');
  await assert.rejects(serve(request(), fixture(data, { resolve: async () => { throw error; } }).fs), (actual) => actual === error);
});

test('short or invalid read results fail the body instead of silently truncating', async () => {
  for (const bytes of [data.slice(0, -1), 'not bytes']) {
    const response = await serve(request(), fixture(data, { readByteRange: async () => bytes }).fs);
    assert.equal(response.status, 200);
    await assert.rejects(response.arrayBuffer(), /media changed during read/);
  }
});

test('mid-stream permission and IO errors fail the body', async () => {
  for (const code of ['FS_PERMISSION_DENIED', 'FS_SANDBOX_DENIED', 'FS_ABORTED', 'FS_IO_ERROR']) {
    const error = new FsError(code);
    const response = await serve(request(), fixture(data, { readByteRange: async () => { throw error; } }).fs);
    assert.equal(response.status, 200);
    await assert.rejects(response.arrayBuffer(), (actual) => actual === error);
  }
});

test('already-aborted request avoids provider work', async () => {
  const abort = new AbortController(); abort.abort();
  const { fs, calls } = fixture();
  assert.equal((await serve(request(null, 'GET', '/video.mp4', abort.signal), fs)).status, 499);
  assert.equal(calls.resolve.length, 0);
});

test('abort during metadata returns 499 even if the provider ignores cancellation', async () => {
  const abort = new AbortController();
  const { fs, calls } = fixture(data, { stat: async () => { abort.abort(); return { type: 'file', size: 10 }; } });
  assert.equal((await serve(request(null, 'GET', '/video.mp4', abort.signal), fs)).status, 499);
  assert.equal(calls.reads.length, 0);
});

function pendingReadFixture() {
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let readSignal;
  const { fs } = fixture(data, {
    readByteRange: async (_target, _range, signal) => {
      readSignal = signal;
      started();
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
  });
  return { fs, ready, signal: () => readSignal };
}

test('request abort terminates an in-flight Fs read and rejects the reader', async () => {
  const abort = new AbortController();
  const pending = pendingReadFixture();
  const response = await serve(request(null, 'GET', '/video.mp4', abort.signal), pending.fs);
  const reader = response.body.getReader();
  const reading = reader.read();
  // Attach the rejection observer before aborting to avoid unhandled promise noise.
  const rejected = assert.rejects(reading, (error) => error.name === 'AbortError');
  await pending.ready;
  abort.abort();
  await rejected;
  assert.equal(pending.signal().aborted, true);
});

test('body cancellation aborts an in-flight Fs read, with no enqueue-after-cancel', async () => {
  const pending = pendingReadFixture();
  const response = await serve(request(), pending.fs);
  const reader = response.body.getReader();
  const reading = reader.read();
  await pending.ready;
  await reader.cancel('consumer stopped');
  assert.deepEqual(await reading, { value: undefined, done: true });
  assert.equal(pending.signal().aborted, true);
  assert.equal(pending.signal().reason, 'consumer stopped');
});

test('abort or cancellation before consuming the body starts no reads', async () => {
  const abort = new AbortController();
  const first = fixture();
  const response = await serve(request(null, 'GET', '/video.mp4', abort.signal), first.fs);
  abort.abort();
  await assert.rejects(response.text(), (error) => error.name === 'AbortError');
  assert.equal(first.calls.reads.length, 0);
  const second = fixture();
  await (await serve(request(), second.fs)).body.cancel();
  assert.equal(second.calls.reads.length, 0);
});

test('request abort listener is removed after completion, cancellation and read failure', async () => {
  for (const mode of ['complete', 'cancel', 'error']) {
    const req = request();
    const added = [];
    const removed = [];
    const add = req.signal.addEventListener.bind(req.signal);
    const remove = req.signal.removeEventListener.bind(req.signal);
    req.signal.addEventListener = (type, listener, options) => { added.push([type, listener]); return add(type, listener, options); };
    req.signal.removeEventListener = (type, listener, options) => { removed.push([type, listener]); return remove(type, listener, options); };
    const fixtureFs = fixture(data, mode === 'error' ? { readByteRange: async () => { throw new Error('read failure'); } } : {}).fs;
    const response = await serve(req, fixtureFs);
    if (mode === 'cancel') await response.body.cancel();
    else if (mode === 'error') await assert.rejects(response.text(), /read failure/);
    else await response.text();
    assert.equal(added.length, 1, mode);
    assert.deepEqual(removed, added, mode);
  }
});

test('both routes are registered through the existing authenticated connection contribution', async () => {
  const contribution = source.slice(end, source.indexOf('const FILE_HOST_PATH =', end));
  const routes = [];
  const labels = [];
  const { fs } = fixture();
  const preservedServeFile = () => new Response('original-file-route');
  const references = new Function('serveFile', 'serveMediaStream', `${contribution}; return SessionMediaReferences;`)(preservedServeFile, serve);
  assert.deepEqual(references.inject, ['connection', 'fs', 'attachments']);
  references.apply({
    fs, attachments: { imageLimits: { maxImageBytes: 3 } },
    connection: { fetch: { register(route) { routes.push(route); return () => {}; } } },
    effect(callback, label) { labels.push(label); callback(); }
  });
  assert.deepEqual(routes.map(({ path }) => path), ['/api/file', '/api/file-stream']);
  assert.deepEqual(labels, ['session-controller: /api/file', 'session-controller: /api/file-stream']);
  for (const route of routes) {
    assert.deepEqual(route.methods, ['GET', 'HEAD']);
    assert.equal(route.requestBody, 'buffered');
  }
  assert.equal(await (await routes[0].fetch(request())).text(), 'original-file-route');
  assert.equal(await (await routes[1].fetch(request())).text(), '0123456789');
});

test('original /api/file remains buffered and enforces its existing attachment byte cap', async () => {
  const fileStart = source.indexOf('async function serveFile(');
  const originalFileHandler = source.slice(fileStart, source.lastIndexOf('/**', start));
  const serveFile = new Function('mime', 'isAbsolute', 'BASE_HEADERS', 'FsError',
    `${originalFileHandler}; return serveFile;`)(
      { lookup: () => 'video/mp4' }, posix.isAbsolute, BASE_HEADERS, FsError
    );
  const tooLarge = await serveFile(request(), fixture().fs, 3);
  assert.equal(tooLarge.status, 413);
  const normal = fixture();
  assert.equal(await (await serveFile(request(), normal.fs, 10)).text(), '0123456789');
  assert.equal(normal.calls.wholeReads.length, 1);
  assert.equal(normal.calls.reads.length, 0);
  const head = await serveFile(request(null, 'HEAD'), fixture().fs, 3);
  assert.equal(head.status, 413);
  assert.equal(head.body, null);
});
