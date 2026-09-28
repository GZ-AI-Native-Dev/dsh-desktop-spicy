const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const source = readFileSync(join(__dirname, 'session-controller.js'), 'utf8');
const start = source.indexOf('async function serveMediaStream(');
const end = source.indexOf('const SessionMediaReferences =', start);
assert.ok(start > 0 && end > start);
class FsError extends Error { constructor(code) { super(code); this.code = code; } }
const serve = new Function('mime', 'isAbsolute', 'BASE_HEADERS', 'FsError', `${source.slice(start, end)}; return serveMediaStream;`)(
  { lookup: () => 'video/mp4' },
  (path) => path.startsWith('/'),
  { 'Cache-Control': 'private, no-store' },
  FsError
);
const data = new TextEncoder().encode('0123456789');
const reads = [];
const fs = {
  resolve: async (path) => ({ displayPath: path }),
  stat: async () => ({ type: 'file', size: data.length }),
  readByteRange: async (_target, { offset, length }) => {
    reads.push([offset, length]);
    return data.slice(offset, offset + length);
  }
};
const request = (range, method = 'GET', path = '/video.mp4') => new Request(`http://localhost/api/file-stream?path=${encodeURIComponent(path)}`, {
  method,
  ...(range ? { headers: { Range: range } } : {})
});
test('full response streams bytes and advertises range support', async () => {
  const response = await serve(request(), fs);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.equal(await response.text(), '0123456789');
});
test('single and suffix ranges, including HEAD', async () => {
  const partial = await serve(request('bytes=2-5'), fs);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(await partial.text(), '2345');
  const suffix = await serve(request('bytes=-3'), fs);
  assert.equal(await suffix.text(), '789');
  const head = await serve(request(null, 'HEAD'), fs);
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.deepEqual(reads.slice(-2), [[2, 4], [7, 3]]);
});
test('rejects invalid ranges and relative paths', async () => {
  for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5']) {
    assert.equal((await serve(request(range), fs)).status, 416);
  }
  assert.equal((await serve(request(null, 'GET', 'relative.mp4'), fs)).status, 400);
});
test('requires a regular file', async () => {
  const response = await serve(request(), { ...fs, stat: async () => ({ type: 'directory' }) });
  assert.equal(response.status, 403);
});
test('missing, denied, and empty files stay bounded', async () => {
  assert.equal((await serve(request(), { ...fs, stat: async () => undefined })).status, 404);
  assert.equal((await serve(request(), { ...fs, resolve: async () => { throw new FsError('FS_SANDBOX_DENIED'); } })).status, 403);
  const empty = await serve(request(), { ...fs, stat: async () => ({ type: 'file', size: 0 }) });
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get('Content-Length'), '0');
  assert.equal(empty.body, null);
});
