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
    if (id === './Workspace') return { ...load(path.join(frontend, 'components/Workspace.tsx')), useWorkspaceUser: () => ({ id: 'owner', display_name: 'Owner' }) };
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
const IssueForm = load(path.join(frontend, 'components/IssueForm.tsx')).default;
const ProjectIssues = load(path.join(frontend, 'components/ProjectIssues.tsx')).default;
const IssueDetail = load(path.join(frontend, 'components/IssueDetail.tsx')).default;
const { workspaceDestination } = load(path.join(frontend, 'lib/navigation.ts'));
const { ISSUE_STATUSES, ISSUE_PRIORITIES } = load(path.join(frontend, 'lib/issues.ts'));
router.push = href => redirects.push(href);
global.fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });
const projectId = '11111111-1111-4111-8111-111111111111';
const issueId = '22222222-2222-4222-8222-222222222222';
const project = { id: projectId, name: 'Test project', description: null, archived_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const issue = { labels: [], id: issueId, project_id: projectId, title: 'Saved issue', description: 'Saved description', type: 'task', status: 'todo', priority: 'medium', created_at: project.created_at, updated_at: project.updated_at };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle(fn) { await act(async () => { fn?.(); await tick(); }); }
async function mount(Component, props, strict = false) {
  requests = []; redirects = [];
  window.history.replaceState({}, '', `/projects/${projectId}/issues/${issueId}`);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(Component, props))));
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}
const formProps = { projectId, onCancel() {}, onSaved() {} };
const submit = view => act(async () => view.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
const click = (view, label) => act(async () => {
  const button = [...view.container.querySelectorAll('button')].find(b => b.textContent === label);
  assert(button, `Missing button ${label}`); button.click();
});
let passed = 0;
async function check(name, run) { await run(); await tick(); assert.equal(unhandled.length, 0); passed++; console.log(`PASS ${name}`); }
(async () => {
  await check('Create defaults and documented enum controls', async () => {
    const view = await mount(IssueForm, formProps);
    for (const [name, expected] of [['type', 'task'], ['status', 'todo'], ['priority', 'medium']]) assert.equal(view.container.querySelector(`[name=${name}]`).value, expected);
    assert.equal(view.container.querySelectorAll('[name=status] option').length, 5);
    assert.equal(view.container.querySelectorAll('[name=priority] option').length, 4);
    assert.equal(document.activeElement.id, 'issue-title'); await view.close();
  });
  await check('Blank and oversized title / description validation prevents requests', async () => {
    const view = await mount(IssueForm, formProps);
    for (const title of ['', '   ', 'x'.repeat(201)]) {
      view.container.querySelector('[name=title]').value = title; await submit(view);
      assert.equal(requests.length, 0); assert.equal(document.activeElement.id, 'issue-title');
    }
    view.container.querySelector('[name=title]').value = 'Valid';
    view.container.querySelector('[name=description]').value = 'x'.repeat(10001); await submit(view);
    assert.equal(requests.length, 0); assert.equal(document.activeElement.id, 'issue-description'); await view.close();
  });
  await check('Create trims fields, sends selected values, and prevents duplicate submits including after success', async () => {
    let saved;
    const view = await mount(IssueForm, { ...formProps, onSaved: value => { saved = value; } });
    view.container.querySelector('[name=title]').value = '  New issue  ';
    view.container.querySelector('[name=description]').value = ' \n ';
    view.container.querySelector('[name=type]').value = 'bug';
    view.container.querySelector('[name=status]').value = 'backlog';
    view.container.querySelector('[name=priority]').value = 'urgent';
    await submit(view); await submit(view); assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), { title: 'New issue', description: null, type: 'bug', status: 'backlog', priority: 'urgent' });
    await settle(() => requests[0].resolve(response(201, issue))); assert.deepEqual(saved, issue);
    await submit(view); assert.equal(requests.length, 1); await view.close();
  });
  await check('Edit starts with saved fields and sends only changed status and cleared description', async () => {
    const view = await mount(IssueForm, { ...formProps, issue });
    assert.equal(view.container.querySelector('[name=title]').value, issue.title);
    assert.equal(view.container.querySelector('[name=description]').value, issue.description);
    view.container.querySelector('[name=description]').value = '';
    view.container.querySelector('[name=status]').value = 'done'; await submit(view);
    assert.equal(requests[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[0].options.body), { description: null, status: 'done' });
    await settle(() => requests[0].resolve(response(200, { ...issue, description: null, status: 'done' }))); await view.close();
  });
  await check('Unchanged edit closes without an empty PATCH', async () => {
    let cancelled = false;
    const view = await mount(IssueForm, { ...formProps, issue, onCancel: () => { cancelled = true; } });
    await submit(view); assert.equal(requests.length, 0); assert(cancelled); await view.close();
  });
  for (const errorCase of ['network', 'validation', 'archived', 'missing', 'csrf']) await check(`Recoverable ${errorCase} failure retains edits and allows retry`, async () => {
    const view = await mount(IssueForm, { ...formProps, issue });
    view.container.querySelector('[name=title]').value = 'Keep draft'; await submit(view);
    await settle(() => {
      if (errorCase === 'network') requests[0].reject(new TypeError('Test offline'));
      else {
        const [status, code] = { validation: [422, 'validation_error'], archived: [409, 'project_archived'], missing: [404, 'issue_not_found'], csrf: [403, 'csrf_failed'] }[errorCase];
        requests[0].resolve(response(status, { error: { code } }));
      }
    });
    assert.equal(view.container.querySelector('[name=title]').value, 'Keep draft');
    assert(view.container.querySelector('[role=alert]')); assert.equal(document.activeElement.getAttribute('role'), 'alert');
    assert.equal(view.container.querySelector('button[type=submit]').disabled, false);
    await submit(view); assert.equal(requests.length, 2); await view.close();
    await settle(() => requests[1].resolve(response(200, issue)));
  });
  await check('Expired session returns to the nested issue URL after login', async () => {
    const view = await mount(IssueForm, { ...formProps, issue });
    view.container.querySelector('[name=status]').value = 'review'; await submit(view);
    await settle(() => requests[0].resolve(response(401, { error: { code: 'authentication_required' } })));
    assert.deepEqual(redirects, [`/login?next=${encodeURIComponent(`/projects/${projectId}/issues/${issueId}`)}`]); await view.close();
    assert.equal(workspaceDestination(`/projects/${projectId}/issues/${issueId}`), `/projects/${projectId}/issues/${issueId}`);
    for (const path of ['//evil.example', 'https://evil.example', '/projects/../account', '/projects/abc/issues/../account']) assert.equal(workspaceDestination(path), '/dashboard');
  });
  await check('Late mutation results do not update unmounted forms', async () => {
    let saved = 0;
    const view = await mount(IssueForm, { ...formProps, onSaved: () => saved++ });
    view.container.querySelector('[name=title]').value = 'New'; await submit(view); await view.close();
    await settle(() => requests[0].resolve(response(201, issue))); assert.equal(saved, 0); assert.equal(redirects.length, 0);
  });
  await check('Project issue pagination loads the correct next range and labels saved states', async () => {
    const view = await mount(ProjectIssues, { projectId, archived: false });
    await settle(() => requests[0].resolve(response(200, { items: [issue], has_more: true })));
    assert(view.container.textContent.includes('Status: Todo')); assert(view.container.textContent.includes('Priority: Medium'));
    await click(view, 'Next'); assert(requests[1].url.endsWith('limit=20&offset=20'));
    await settle(() => requests[1].resolve(response(200, { items: [{ ...issue, title: 'Second page' }], has_more: false })));
    assert(view.container.textContent.includes('Second page')); await click(view, 'Previous'); assert(requests[2].url.endsWith('offset=0')); await view.close();
  });
  for (const archived of [false, true]) await check(`${archived ? 'Archived' : 'Active'} project empty state and create visibility`, async () => {
    const view = await mount(ProjectIssues, { projectId, archived });
    await settle(() => requests[0].resolve(response(200, { items: [], has_more: false })));
    assert(view.container.textContent.includes('No issues yet.'));
    assert.equal([...view.container.querySelectorAll('button')].some(b => b.textContent === 'Create issue'), !archived);
    if (archived) assert(view.container.textContent.includes('read-only')); await view.close();
  });
  await check('Issue creation routes to the actual saved ID', async () => {
    const view = await mount(ProjectIssues, { projectId, archived: false });
    await settle(() => requests[0].resolve(response(200, { items: [], has_more: false })));
    await click(view, 'Create issue'); view.container.querySelector('[name=title]').value = 'New'; await submit(view);
    await settle(() => requests[1].resolve(response(201, issue)));
    assert.deepEqual(redirects, [`/projects/${projectId}/issues/${issueId}`]); await view.close();
  });
  for (const archived of [false, true]) await check(`Issue detail ${archived ? 'read-only' : 'status edit and saved feedback'} with plain-text description`, async () => {
    const view = await mount(IssueDetail, { projectId, issueId });
    await settle(() => {
      requests[0].resolve(response(200, { ...project, archived_at: archived ? project.created_at : null }));
      requests[1].resolve(response(200, { ...issue, description: '<script>text only</script>' }));
    });
    await settle(() => requests.filter(r => /\/(labels|comments)\?/.test(r.url)).forEach(r => r.resolve(response(200, { items: [], has_more: false }))));
    assert.equal(view.container.querySelector('script'), null); assert(view.container.textContent.includes('<script>text only</script>'));
    assert.equal([...view.container.querySelectorAll('button')].some(b => b.textContent === 'Edit issue'), !archived);
    if (archived) assert(view.container.textContent.includes('Restore the project'));
    else {
      await click(view, 'Edit issue'); view.container.querySelector('[name=status]').value = 'done'; await submit(view);
      await settle(() => requests.find(r => r.options.method === 'PATCH').resolve(response(200, { ...issue, status: 'done' })));
      assert(view.container.textContent.includes('Status: Done')); assert(view.container.textContent.includes('Issue changes saved.'));
      assert.equal(view.container.querySelector('[name=status]'), null);
    }
    await view.close();
  });
  await check('Issue detail missing and network errors have distinct states', async () => {
    for (const status of [404, 503]) {
      const view = await mount(IssueDetail, { projectId, issueId });
      await settle(() => { requests[0].resolve(response(200, project)); requests[1].resolve(response(status, {})); });
      assert(view.container.textContent.includes(status === 404 ? 'Issue not found.' : 'This issue couldn’t load.'));
      assert.equal([...view.container.querySelectorAll('button')].some(b => b.textContent === 'Try again'), status === 503); await view.close();
    }
  });
  console.log(`${passed} issue checks passed; zero unhandled rejections. Simulated DOM/fetch/router; NOT browser verification.`);
  dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; dom.window.close(); });
