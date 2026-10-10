'use strict';
// Lightweight source-level regression: stdlib only; no app, media, or server startup.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const directory = __dirname;
const reports = [];
function test(name, run) {
  run();
  reports.push(name);
  console.log(`PASS ${name}`);
}
function harness(filename, expose) {
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  let states = [], cursor = 0;
  const react = {
    lazy: (load) => ({ load }), forwardRef: (render) => render,
    useState: (initial) => {
      const at = cursor++;
      if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
      return [states[at], (value) => { states[at] = typeof value === 'function' ? value(states[at]) : value; }];
    },
    useEffect: () => {}, useMemo: (fn) => fn(), useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }), useId: () => 'id-1'
  };
  const primitives = new Proxy({}, { get: (_target, key) => key });
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@deepseek-ai/dsh-client-ui-primitives': primitives,
    '@deepseek-ai/dsh-client-store': { defineStore: (value) => value, createSnapshotStore: (value) => ({ getSnapshot: () => value, subscribe: () => () => {}, set: (next) => { value = next; }, update: (fn) => fn(value) }) }, 'react-dom': {}
  };
  let exports;
  const context = vm.createContext({ URL, URLSearchParams, console, AbortController, TextEncoder, TextDecoder,
    window: { __ModuleLoader__: { load: ({ factory }) => {
      const require = (name) => {
        assert.ok(name in deps, `unexpected dependency ${name}`);
        return deps[name];
      };
      exports = factory(require);
    } } }
  });
  const source = fs.readFileSync(path.join(directory, filename), 'utf8');
  new vm.Script(source, { filename }); // Parse the unmodified production source first.
  const instrumented = source.replace('\t\texports.apply = apply;', `\t\texports.__test = { ${expose.join(', ')} };\n\t\texports.apply = apply;`);
  assert.notEqual(source, instrumented);
  vm.runInContext(instrumented, context, { filename });
  context.document = { baseURI: 'http://127.0.0.1:3456/' };
  return { api: exports.__test, apply: exports.apply, source,
    render: (component, props, reset = true) => { if (reset) states = []; cursor = 0; return component(props); }
  };
}
const deliverables = harness('deliverables.js', ['fileAddressFor', 'sessionFileAddress', 'resolveWorkspacePath', 'FileDiff', 'Deliverables', 'TextDiff']);
const documentpreview = harness('documentpreview.js', ['parseFileAddress', 'fileMediaUrl', 'videoMediaUrl', 'VideoBody', 'LoadedVideo', 'applyVideo', 'VIDEO_EXTENSIONS', 'DocumentPreviewRegistry', 'binaryDocumentPath', 'matchingDocumentPreviews']);
const d = deliverables.api, p = documentpreview.api;
const plain = (value) => JSON.parse(JSON.stringify(value));
test('ResourceAddress preserves drive, backslash, spaces, Chinese, UNC and query-significant characters', () => {
  const cases = [
    ['C:\\Work Space\\项目', 'C:\\Work Space\\项目\\output #1%.mp4', 'output #1%.mp4'],
    ['C:\\Work Space\\项目', 'assets\\测试.mp4', 'assets/测试.mp4'],
    ['C:\\Work Space\\项目', 'D:\\other dir\\测试.mp4', 'D:/other dir/测试.mp4'],
    ['C:\\Work Space\\项目', '\\\\server\\share\\中文 名称.mp4', '//server/share/中文 名称.mp4'],
    ['\\\\server\\share\\项目', '\\\\server\\share\\项目\\视频.mp4', '视频.mp4'],
    ['/workspace', '/workspace/a.mp4', 'a.mp4']
  ];
  for (const [cwd, input, expected] of cases) {
    const address = d.fileAddressFor('session x/中文', cwd, input);
    assert.match(address, /^dsh-resource:\/\/file\/session\//);
    assert.deepEqual(plain(p.parseFileAddress(address)), { scope: 'session', sessionId: 'session x/中文', path: expected });
  }
  assert.equal(d.resolveWorkspacePath('C:\\工作 目录', 'media/test.webm'), 'C:\\工作 目录\\media/test.webm');
  assert.equal(d.resolveWorkspacePath('C:\\工作 目录', 'D:\\media\\test.webm'), 'D:\\media\\test.webm');
});
test('binary changed-file card opens a complete resource, text card retains review coordinates', () => {
  const files = [{ path: 'media\\测试.mp4', binary: true }, { path: 'src/main.js' }];
  const opened = [], reviewed = [];
  const tree = deliverables.render(d.Deliverables, {
    matched: { changes: { seq: 9 }, presented: [] }, sessionId: 's1',
    openFile: () => { throw new Error('raw native path opener was called'); },
    openChangedFile: (...args) => opened.push(args), openChangesReview: (...args) => reviewed.push(args),
    useSessions: (fn) => fn({ byId: { s1: { cwd: 'C:\\工作 区' } } }),
    useShowCodeDiff: (fn) => fn(true), usePresentedOpen: (fn) => fn({}),
    usePresentedHost: (fn) => fn('ready'), useChangesSummary: () => ({ turn: 3, files }),
    useChangesDiff: () => {}, loadChangesDiff: () => {}, loadChangesSummary: () => {}, reloadPresentedHost: () => {},
    t: (key) => key, renderSlot: () => null
  });
  const changed = tree.props.children[0];
  changed.props.openReview(0);
  assert.deepEqual(opened, [['s1', 'C:\\工作 区', 'media\\测试.mp4']]);
  assert.equal(reviewed.length, 0);
  changed.props.openReview(1);
  assert.deepEqual(plain(reviewed), [[{ sessionId: 's1', seq: 9, turn: 3 }, 1]]);
});
test('binary comparison shows full-file button; text comparison still uses TextDiff', () => {
  let clicked = 0;
  const binary = d.FileDiff({ state: { kind: 'binary' }, openBinary: () => clicked++, t: (key) => key });
  const button = binary.props.children.find((child) => child && child.props['data-review-open-binary']);
  assert.ok(button);
  assert.equal(button.props.children, 'review.openFile');
  button.props.onClick();
  assert.equal(clicked, 1);
  const state = { kind: 'text', hunks: [{ lines: ['-old', '+new'] }] };
  const text = d.FileDiff({ state, split: true, wrap: true, t: (key) => key });
  assert.equal(text.type, d.TextDiff);
  assert.equal(text.props.diff, state);
  assert.equal(text.props.split, true);
  assert.equal(text.props.wrap, true);
});
test('binary card injected opener uses ResourceAddress instead of a C: URL', () => {
  const registrations = [], opened = [];
  deliverables.apply({
    effect: (fn) => fn(), on: () => {}, provide: () => {},
    uiConversation: { events: { register: () => {} } },
    locale: { register: () => () => {}, bind: () => (key) => key },
    configForms: { developerTools: { enabled: () => true } },
    sidebarRight: { openResource: (address) => opened.push(address) },
    sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, fn) => fn(), register: (options) => { registrations.push(options); return () => {}; } }
  });
  const tail = registrations.find((entry) => entry.name === 'conversation.chat.turnTail');
  assert.ok(tail);
  const opener = tail.inject().openChangedFile;
  opener('s1', 'C:\\work', 'C:\\work\\中文 视频.mp4');
  assert.deepEqual(plain(p.parseFileAddress(opened[0])), { scope: 'session', sessionId: 's1', path: '中文 视频.mp4' });
  assert.match(deliverables.source, /openBinary: \(\) => tab\.actions\.openResource\(fileAddressFor\(sessionId, cwd, file\.path\)\)/);
});
test('authenticated stream URLs preserve current origin, deployment prefix and local Windows paths; reject UNC', () => {
  const base = 'http://127.0.0.1:3456/workbench/';
  for (const file of ['C:\\视频 空间\\movie #1%.mp4', 'D:/中文 路径/movie.webm', '/workspace/movie.mp4']) {
    const url = new URL(p.videoMediaUrl(base, file));
    assert.equal(url.origin, 'http://127.0.0.1:3456');
    assert.equal(url.pathname, '/workbench/api/file-stream');
    assert.equal(url.searchParams.get('path'), file);
    assert.equal(url.searchParams.has('token'), false);
  }
  assert.equal(p.videoMediaUrl('dsh-app://app/', 'C:\\视频\\x.mp4').split('?')[0], 'dsh-app://app/api/file-stream');
  for (const file of ['relative/video.mp4', 'C:relative.mp4', 'https://server/file.mp4', 'file:///C:/file.mp4', 'C:\\bad\u0000file.mp4', '\\\\server', '//server', '\\\\server\\share\\中文 名称.mp4', '//server/share/video #1.webm']) {
    assert.equal(p.videoMediaUrl(base, file), undefined);
  }
  assert.equal(p.videoMediaUrl('file:///C:/app/', 'C:\\media\\x.mp4'), undefined);
  // Existing Markdown/image helper keeps its intentional UNC limit.
  assert.equal(p.fileMediaUrl(base, '\\\\server\\share\\video.mp4'), undefined);
});
test('video body resolves ResourceAddress via resource hook and sends observed source version on metadata', () => {
  const address = d.fileAddressFor('s1', 'C:\\工作 区', 'assets\\测试.mp4');
  const calls = [], meta = { absolutePath: 'C:\\工作 区\\assets\\测试.mp4', version: 'version-123' };
  const content = { kind: 'renderer', revision: 5, loaded: (value) => calls.push(['loaded', value]), failed: () => calls.push(['failed']) };
  const resolved = documentpreview.render(p.VideoBody, { resourceAddress: address, content, useResource: (value) => { assert.equal(value, address); return { value: meta }; }, t: (key) => key });
  assert.equal(resolved.type, p.LoadedVideo);
  assert.ok(resolved.key.endsWith(':5'));
  const tree = documentpreview.render(p.LoadedVideo, resolved.props);
  const video = tree.props.children.find((child) => child && child.type === 'video');
  assert.equal(video.props.controls, true);
  assert.equal(video.props.preload, 'metadata');
  assert.equal(new URL(video.props.src).searchParams.get('path'), meta.absolutePath);
  video.props.onLoadedMetadata();
  assert.deepEqual(calls, [['loaded', 'version-123']]);
  video.props.onError();
  assert.deepEqual(calls, [['loaded', 'version-123'], ['failed']]);
  const errorTree = documentpreview.render(p.LoadedVideo, resolved.props, false);
  assert.equal(errorTree.props.children[0].props['data-video-error'], true);
  assert.equal(errorTree.props.children[0].props.children, 'unsupported');
  const next = documentpreview.render(p.VideoBody, { resourceAddress: address, content: { ...content, revision: 6 }, useResource: () => ({ value: meta }), t: (key) => key });
  assert.notEqual(next.key, resolved.key);
  assert.equal(documentpreview.render(p.LoadedVideo, next.props).props.children[0], false);
  const missing = documentpreview.render(p.VideoBody, { resourceAddress: address, content, useResource: () => ({}), t: (key) => key });
  assert.equal(missing.props.role, 'alert');
  assert.equal(missing.props.children, 'missing');
});
test('video registry selects mp4/webm/mov and other containers as binary renderer, leaving text/image selection intact', () => {
  const definitions = [], slots = [];
  p.applyVideo({ effect: (fn) => fn(), locale: { register: () => () => {}, bind: () => (key) => key },
    documentPreviews: { register: (definition) => definitions.push(definition) },
    slots: { inject: (_name, fn) => fn(), register: (options, component) => slots.push({ options, component }) } });
  assert.equal(definitions.length, 1);
  const definition = definitions[0];
  assert.equal(definition.loading, 'renderer');
  assert.equal(definition.wrap, false);
  assert.equal(slots[0].component, p.VideoBody);
  assert.equal(slots[0].options.key, definition.id);
  assert.deepEqual(plain(definition.extensions), ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'avi', 'mkv']);
  for (const suffix of definition.extensions) {
    assert.equal(p.binaryDocumentPath(definitions, `C:\\资料\\视频.${suffix.toUpperCase()}`), true);
    assert.equal(p.matchingDocumentPreviews(definitions, `C:\\资料\\视频.${suffix}`)[0].id, definition.id);
  }
  assert.equal(p.matchingDocumentPreviews(definitions, 'C:\\a.txt').length, 0);
  assert.equal(p.matchingDocumentPreviews(definitions, 'C:\\a.png').length, 0);
});
test('system-application header action remains available for a resolved video, including codec errors', () => {
  assert.match(documentpreview.source, /fileOwner !== void 0 && renderSlot\("sidebar\.right\.tab\.document\.actions", fileOwner\)/);
  assert.match(documentpreview.source, /const fileOwner = absolutePath === void 0 \? void 0 : \{ absolutePath \}/);
  assert.match(documentpreview.source, /apply\$5\(ctx\);\s*applyVideo\(ctx\);\s*apply\$4\(ctx\);/);
});
console.log(JSON.stringify({ status: 'passed', tests: reports.length, files: ['deliverables.js', 'documentpreview.js'].map((filename) => ({ filename, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, filename))).digest('hex') })) }));
