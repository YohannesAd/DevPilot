// Local diagnostic harness: real React DOM in jsdom, mocked fetch/router. Not a browser test.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const frontend = path.resolve(__dirname, '..');
const requireFrontend = Module.createRequire(path.join(frontend, 'package.json'));
const ts = requireFrontend('typescript');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/login' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.FormData = dom.window.FormData;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = requireFrontend('react');
const { act } = React;
const { createRoot } = requireFrontend('react-dom/client');
const baseline = process.argv.includes('--baseline');
const unhandled = [];
process.on('unhandledRejection', error => unhandled.push(error));
let requests = [], redirects = [], redirectError = null;
const router = { replace: href => { if (redirectError) throw redirectError; redirects.push(href); } };
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file);
  cache.set(file, m);
  m.filename = file;
  m.paths = Module._nodeModulePaths(frontend);
  m.require = id => {
    if (id === 'next/navigation') return { useRouter: () => router };
    if (id === 'next/link') return { __esModule: true, default: props => React.createElement('a', props) };
    if (id.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const candidate = id.startsWith('@/') ? path.join(frontend, id.slice(2)) : path.resolve(path.dirname(file), id);
      for (const extension of ['.ts', '.tsx']) if (fs.existsSync(candidate + extension)) return load(candidate + extension);
    }
    return requireFrontend(id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
const { useApi } = load(path.join(frontend, 'lib/useApi.ts'));
const Home = load(path.join(frontend, 'app/page.tsx')).default;
let latest, renders = 0;
function Probe({ apiPath }) {
  latest = useApi(apiPath); renders++;
  return React.createElement('p', null, latest.error ? 'error' : latest.loading ? 'loading' : JSON.stringify(latest.data));
}
global.fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });
const ok = value => response(200, value);
const unauthorized = response(401, { error: { code: 'authentication_required' } });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle(fn) { await act(async () => { fn?.(); await tick(); }); }
async function mount({ home = false, strict = false, apiPath = '/api/projects' } = {}) {
  requests = []; redirects = []; latest = undefined; renders = 0;
  window.history.replaceState({}, '', home ? '/' : '/projects?status=archived');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const tree = newPath => React.createElement(strict ? React.StrictMode : React.Fragment, null,
    home ? React.createElement(Home) : React.createElement(Probe, { apiPath: newPath }));
  await act(async () => root.render(tree(apiPath)));
  return { container, render: nextPath => act(async () => root.render(tree(nextPath))),
    close: async () => { await act(async () => root.unmount()); container.remove(); } };
}
let passed = 0;
async function check(name, run) {
  await run(); await tick(); assert.equal(unhandled.length, 0, 'Unhandled rejection');
  passed++; console.log(`PASS ${name}`);
}
(async () => {
  await check('Failed session redirect becomes a visible error, never an unhandled rejection', async () => {
    const view = await mount(); redirectError = new Error('Navigation failed');
    try {
      await settle(() => requests[0].resolve(unauthorized));
      assert.equal(latest.error.code, 'navigation_failed');
      assert.equal(latest.loading, false);
    } finally { redirectError = null; await view.close(); }
  });
  await check('Strict Mode replay ignores old success and does not create an abort signal', async () => {
    const view = await mount({ strict: true }); assert.equal(requests.length, 2);
    assert(requests.every(r => r.options.signal === undefined));
    await settle(() => requests[1].resolve(ok('current')));
    await settle(() => requests[0].resolve(ok('obsolete')));
    assert.equal(latest.data, 'current');
    await view.render('/api/projects'); assert.equal(requests.length, 2); await view.close();
  });
  await check('A to B to A ignores stale responses even when the path matches again', async () => {
    const view = await mount({ apiPath: '/api/projects?status=active' });
    await view.render('/api/projects?status=archived');
    await view.render('/api/projects?status=active'); assert.equal(requests.length, 3);
    await settle(() => requests[2].resolve(ok('new active')));
    await settle(() => { requests[0].resolve(ok('old active')); requests[1].resolve(ok('archived')); });
    assert.equal(latest.data, 'new active'); await view.close();
  });
  await check('Retry ignores the old success and preserves the latest failure', async () => {
    const view = await mount(); await settle(() => latest.retry()); assert.equal(requests.length, 2);
    await settle(() => requests[1].resolve(response(503, {})));
    await settle(() => requests[0].resolve(ok('old')));
    assert.equal(latest.error.status, 503); assert.equal(latest.data, undefined); await view.close();
  });
  await check('Error retry clears the error and loads fresh data', async () => {
    const view = await mount(); await settle(() => requests[0].reject(new TypeError('Test network failure')));
    assert.equal(latest.error.code, 'unavailable');
    await settle(() => latest.retry()); assert.equal(latest.error, undefined); assert.equal(latest.loading, true);
    await settle(() => requests[1].resolve(ok('recovered')));
    assert.equal(latest.data, 'recovered'); assert.equal(latest.loading, false); await view.close();
  });
  await check('Active 401 redirects to login with the current return URL', async () => {
    const view = await mount(); await settle(() => requests[0].resolve(unauthorized));
    assert.deepEqual(redirects, ['/login?next=%2Fprojects%3Fstatus%3Darchived']); await view.close();
  });
  await check('Stale 401 cannot redirect after changing pages', async () => {
    const view = await mount(); await view.render('/api/projects/new-id');
    await settle(() => { requests[1].resolve(ok('current')); requests[0].resolve(unauthorized); });
    assert.equal(redirects.length, 0); assert.equal(latest.data, 'current'); await view.close();
  });
  for (const outcome of ['success', 'failure', '401']) await check(`Unmount ignores late ${outcome}`, async () => {
    const view = await mount(); const pending = requests[0]; await view.close(); const count = renders;
    await settle(() => outcome === 'failure' ? pending.reject(new TypeError('Test failure')) : pending.resolve(outcome === '401' ? unauthorized : ok('late')));
    assert.equal(renders, count); assert.equal(redirects.length, 0);
  });
  await check('Invalid JSON remains a visible hook error', async () => {
    const view = await mount();
    await settle(() => requests[0].resolve({ status: 200, ok: true, json: async () => { throw new SyntaxError('Test malformed JSON'); } }));
    assert(latest.error instanceof SyntaxError); assert.equal(view.container.textContent, 'error'); await view.close();
  });
  await check('Remount/refresh simulation loads new saved data', async () => {
    for (const value of ['before refresh', 'after refresh']) {
      const view = await mount(); await settle(() => requests[0].resolve(ok(value)));
      assert.equal(latest.data, value); await view.close();
    }
  });
  await check('Welcome page Strict Mode preserves only the live signed-in redirect', async () => {
    const view = await mount({ home: true, strict: true }); assert.equal(requests.length, 2);
    assert(requests.every(r => r.options.signal === undefined));
    await settle(() => requests.forEach(r => r.resolve(ok({}))));
    assert.deepEqual(redirects, ['/dashboard']); await view.close();
  });
  await check('Welcome page treats signed out normally and reports actual failures', async () => {
    for (const status of [401, 503]) {
      const view = await mount({ home: true });
      await settle(() => requests[0].resolve(response(status, {})));
      assert.equal(!!view.container.querySelector('[role=alert]'), status === 503);
      assert.equal(redirects.length, 0); await view.close();
    }
  });
  await check('Welcome page ignores late results after leaving', async () => {
    const view = await mount({ home: true }); const pending = requests[0]; await view.close();
    await settle(() => pending.resolve(ok({}))); assert.equal(redirects.length, 0);
  });
  console.log(`${passed} checks passed; zero unhandled rejections. Simulated DOM/fetch/router, NOT Chrome or Edge.`);
  dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; dom.window.close(); });
