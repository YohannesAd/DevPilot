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
const AuthForm = load(path.join(frontend, 'components/AuthForm.tsx')).default;
const { api, ApiError } = load(path.join(frontend, 'lib/api.ts'));
global.fetch = (url, options = {}) => new Promise((resolve, reject) => {
  const request = { url, options, resolve, reject };
  requests.push(request);
  if (options.signal?.aborted) reject(options.signal.reason);
  else options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
});
const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });
const signedOut = response(401, { error: { code: 'authentication_required' } });
const signedIn = response(200, { id: 'test-user' });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle(fn) { await act(async () => { fn?.(); await tick(); }); }
async function mount(mode, { strict = true, search = '' } = {}) {
  requests = []; redirects = []; redirectError = null;
  window.history.replaceState({}, '', `/${mode}${search}`);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  let commits = 0;
  const tree = () => React.createElement(strict ? React.StrictMode : React.Fragment, null,
    React.createElement(React.Profiler, { id: 'auth', onRender: () => commits++ }, React.createElement(AuthForm, { mode })));
  await act(async () => root.render(tree()));
  return { container, root, commits: () => commits, rerender: () => act(async () => root.render(tree())),
    close: async () => { await act(async () => root.unmount()); container.remove(); } };
}
let passed = 0;
async function check(name, run) { await run(); await tick(); assert.equal(unhandled.length, 0, 'Unhandled rejection'); passed++; console.log(`PASS ${name}`); }
(async () => {
  await check('API abort before headers is caught by terminal catch (baseline behavior)', async () => {
    const controller = new AbortController(); let caught;
    const request = api('/api/users/me', { signal: controller.signal }).catch(error => { caught = error; });
    controller.abort(); await request;
    assert(caught instanceof ApiError); assert.equal(caught.code, 'unavailable');
  });
  await check('API abort during JSON reaches terminal catch (baseline behavior)', async () => {
    requests = [];
    const controller = new AbortController(); let caught;
    const request = api('/api/users/me', { signal: controller.signal }).catch(error => { caught = error; });
    requests[0].resolve({ status: 200, ok: true, json: () => new Promise((resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    }) });
    await tick(); controller.abort(); await request; assert.equal(caught.name, 'AbortError');
  });
  for (const mode of ['login', 'register']) {
    await check(`${mode}: Strict Mode replay, 401, state rerender, remount/refresh simulation`, async () => {
      for (let refresh = 0; refresh < 2; refresh++) {
        const view = await mount(mode);
        assert.equal(requests.length, 2);
        assert.equal(requests[0].options.signal?.aborted, baseline ? true : undefined);
        await settle(() => requests.forEach(r => r.resolve(signedOut)));
        assert.equal(view.container.querySelector('[role=alert]'), null);
        await act(async () => view.container.querySelector('input[type=checkbox]').click());
        await view.rerender(); assert.equal(requests.length, 2, 'No session-effect restart on state changes');
        assert.equal(redirects.length, 0); await view.close();
      }
    });
    await check(`${mode}: signed-in redirect preserves safe next and cleanup stays handled`, async () => {
      const view = await mount(mode, { search: '?next=%2Fprojects%3Fstatus%3Darchived' });
      await settle(() => requests.forEach(r => r.resolve(signedIn)));
      assert.deepEqual(redirects, ['/projects?status=archived']);
      await view.close();
    });
    await check(`${mode}: unsafe next falls back to dashboard`, async () => {
      const view = await mount(mode, { strict: false, search: '?next=https%3A%2F%2Funtrusted.example' });
      await settle(() => requests[0].resolve(signedIn));
      assert.deepEqual(redirects, ['/dashboard']); await view.close();
    });
    await check(`${mode}: stale Strict Mode result cannot redirect`, async () => {
      const view = await mount(mode);
      await settle(() => { requests[1].resolve(signedOut); requests[0].resolve(signedIn); });
      assert.equal(redirects.length, 0); await view.close();
    });
    for (const failure of [false, true]) await check(`${mode}: no late ${failure ? 'failure update' : 'redirect'} after unmount`, async () => {
      const view = await mount(mode, { strict: false }); const pending = requests[0];
      await view.close(); const commits = view.commits();
      await settle(() => failure ? pending.reject(new TypeError('Test transport failure')) : pending.resolve(signedIn));
      assert.equal(redirects.length, 0); assert.equal(view.commits(), commits);
    });
    for (const kind of ['server', 'network', 'json', 'navigation']) await check(`${mode}: ${kind} failure ${baseline ? 'was hidden' : 'is visible'}`, async () => {
      const view = await mount(mode, { strict: false });
      if (kind === 'navigation') redirectError = new Error('Test navigation failure');
      await settle(() => {
        if (kind === 'network') requests[0].reject(new TypeError('Test transport failure'));
        else if (kind === 'json') requests[0].resolve({ status: 200, ok: true, json: async () => { throw new SyntaxError('Test invalid JSON'); } });
        else requests[0].resolve(kind === 'server' ? response(503, {}) : signedIn);
      });
      assert.equal(!!view.container.querySelector('[role=alert]'), !baseline);
      assert.equal(requests.length, 1); await view.close();
    });
    for (const retryAfter of ['45', null, 'invalid']) {
      await check(`${mode}: 429 preserves drafts, focuses guidance, and only retries on submission (${retryAfter})`, async () => {
        const view = await mount(mode, { strict: false });
        await settle(() => requests[0].resolve(signedOut));
        const email = view.container.querySelector('[name=email]'); email.value = 'test@example.invalid';
        const password = view.container.querySelector('[name=password]'); password.value = 'x'.repeat(16);
        const name = view.container.querySelector('[name=display_name]'); if (name) name.value = 'Test';
        const submit = () => view.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        await settle(submit);
        await settle(() => requests[1].resolve({ ...response(429, { error: { code: 'rate_limited' } }), headers: { get: () => retryAfter } }));
        const alert = view.container.querySelector('[role=alert]');
        assert.match(alert.textContent, /Too many attempts/);
        assert.match(alert.textContent, retryAfter === '45' ? /45 seconds/ : /few minutes/);
        assert.equal(document.activeElement, alert);
        assert.equal(email.value, 'test@example.invalid'); assert.equal(password.value, 'x'.repeat(16));
        if (name) assert.equal(name.value, 'Test');
        assert.equal(view.container.querySelector('button[type=submit]').disabled, false);
        await settle(); await settle(); assert.equal(requests.length, 2); assert.equal(redirects.length, 0);
        await settle(submit); assert.equal(requests.length, 3);
        assert.deepEqual(JSON.parse(requests[2].options.body), JSON.parse(requests[1].options.body));
        await settle(() => requests[2].resolve(response(mode === 'register' ? 201 : 200, {})));
        assert.equal(redirects.length, 1); await view.close();
      });
    }
    await check(`${mode}: unavailable rate-limit storage preserves drafts and gives retry guidance`, async () => {
      const view = await mount(mode, { strict: false });
      await settle(() => requests[0].resolve(signedOut));
      view.container.querySelector('[name=email]').value = 'test@example.invalid';
      view.container.querySelector('[name=password]').value = 'x'.repeat(16);
      const name = view.container.querySelector('[name=display_name]'); if (name) name.value = 'Test';
      await settle(() => view.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
      await settle(() => requests[1].resolve(response(503, { error: { code: 'auth_unavailable' } })));
      assert.match(view.container.querySelector('[role=alert]').textContent, /temporarily unavailable.*minute/);
      assert.equal(view.container.querySelector('[name=password]').value, 'x'.repeat(16));
      assert.equal(requests.length, 2); await view.close();
    });
    for (const gatewayBody of [{ error: { code: 'proxy_unavailable' } }, null]) await check(`${mode}: cold-start failure preserves draft and never retries (${gatewayBody ? 'JSON' : 'provider non-JSON'})`, async () => {
      const view = await mount(mode, { strict: false });
      await settle(() => requests[0].resolve(signedOut));
      view.container.querySelector('[name=email]').value = 'test@example.invalid';
      view.container.querySelector('[name=password]').value = 'x'.repeat(16);
      const name = view.container.querySelector('[name=display_name]'); if (name) name.value = 'Test';
      await settle(() => view.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
      await settle(() => requests[1].resolve(gatewayBody ? response(503, gatewayBody) : { status: 503, ok: false, json: async () => { throw new SyntaxError('Synthetic provider HTML'); } }));
      assert.match(view.container.querySelector('[role=alert]').textContent, /waking up.*Wait a minute/);
      assert.equal(view.container.querySelector('[name=password]').value, 'x'.repeat(16));
      assert.equal(view.container.querySelector('[name=email]').value, 'test@example.invalid');
      if (name) assert.equal(name.value, 'Test');
      await settle(); assert.equal(requests.length, 2); await view.close();
    });
    await check(`${mode}: valid form submission keeps its existing redirect`, async () => {
      const view = await mount(mode, { strict: false });
      await settle(() => requests[0].resolve(signedOut));
      view.container.querySelector('[name=email]').value = 'test@example.invalid';
      view.container.querySelector('[name=password]').value = 'x'.repeat(16);
      const name = view.container.querySelector('[name=display_name]'); if (name) name.value = 'Test';
      await act(async () => view.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(requests.length, 2); assert(requests[1].url.endsWith(`/api/auth/${mode}`));
      await settle(() => requests[1].resolve(response(mode === 'register' ? 201 : 200, {})));
      assert.deepEqual(redirects, [mode === 'register' ? '/login?registered=1' : '/dashboard']); await view.close();
    });
  }
  console.log(`${passed} checks passed (${baseline ? 'baseline' : 'patched'}); zero unhandled rejections. Simulated DOM/fetch/router, NOT Chrome or Edge.`);
  dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; dom.window.close(); });
