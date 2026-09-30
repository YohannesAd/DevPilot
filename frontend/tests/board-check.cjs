// Local diagnostic harness: real React DOM in jsdom, mocked fetch/router. Not a browser test.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const { JSDOM } = require('../../.local-checks/auth-checks/node_modules/jsdom');
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
    if (id === 'next/navigation') return { useRouter: () => router, useSearchParams: () => new URLSearchParams(window.location.search) };
    if (id === 'next/link') return { __esModule: true, default: ({ scroll, ...props }) => React.createElement('a', props) };
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
const Board = load(path.join(frontend, 'components/IssueBoard.tsx')).default;
const Views = load(path.join(frontend, 'components/ProjectIssueViews.tsx')).default;
router.push = href => redirects.push(href);
const projectId = '11111111-1111-4111-8111-111111111111';
const issue = { id: '22222222-2222-4222-8222-222222222222', project_id: projectId, title: 'Saved task', type: 'task', priority: 'urgent', status: 'todo', description: null, created_at: '2026-01-01T00:00:00.000001Z', updated_at: '2026-01-01T00:00:00Z' };
const props = { projectId, archived: false };
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const page = (items = [issue], has_more = false) => response(200, { items, has_more });
const saved = status => response(200, { ...issue, status, updated_at: '2026-02-01T00:00:00Z' });
global.fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
async function settle(fn) { await act(async () => { fn?.(); await tick(); }); }
async function mount(Component = Board, supplied = props, strict = false) {
  requests = []; redirects = [];
  window.history.replaceState({}, '', `/projects/${projectId}?view=board`);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const render = () => act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(Component, supplied))));
  await render();
  return { container, render, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}
const column = (v, name) => v.container.querySelector(`[aria-labelledby="column-${name}"]`);
const click = async (v, label) => settle(() => {
  const button = [...v.container.querySelectorAll('button')].find(x => x.textContent === label);
  assert(button, `Missing ${label}`); button.click();
});
const choose = async (v, target) => settle(() => {
  const select = v.container.querySelector(`#move-${issue.id}`); select.value = target;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
});
const submit = v => settle(() => v.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
let passed = 0;
async function check(name, run) { await run(); await tick(); assert.equal(unhandled.length, 0); passed++; console.log(`PASS ${name}`); }
(async () => {
 await check('Five documented columns, bounded first page and honest empty states', async () => {
  const v = await mount(); assert.match(v.container.textContent, /Loading issues/);
  assert.match(requests[0].url, /limit=100&offset=0$/);
  await settle(() => requests[0].resolve(page([])));
  assert.deepEqual([...v.container.querySelectorAll('h3')].map(x => x.textContent), ['Backlog','Todo','In Progress','Review','Done']);
  assert.equal(v.container.querySelectorAll('section[data-selected]').length, 5);
  assert.match(v.container.textContent, /All issues loaded/); await v.close();
 });
 await check('Confirmed move, duplicate protection, announcement, destination focus and mobile selection', async () => {
  const v = await mount(); await settle(() => requests[0].resolve(page()));
  assert.match(v.container.textContent, /Priority: Urgent/);
  await choose(v, 'done'); await submit(v); await submit(v);
  assert.equal(requests.length, 2); assert.equal(requests[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[1].options.body), { status: 'done' });
  assert(column(v,'todo').querySelector('li')); assert(!column(v,'done').querySelector('li'));
  assert(v.container.querySelector('select[id^=move]').disabled);
  await settle(() => requests[1].resolve(saved('done')));
  assert(!column(v,'todo').querySelector('li')); assert(column(v,'done').querySelector('li'));
  assert.match(v.container.querySelector('[role=status]').textContent, /moved to Done/);
  assert.equal(document.activeElement.id, `board-issue-${issue.id}`);
  assert.equal(v.container.querySelector('#board-column').value, 'done'); await v.close();
 });
 await check('Network failure keeps card and chosen destination; retry sends same status', async () => {
  const v = await mount(); await settle(() => requests[0].resolve(page())); await choose(v,'review'); await submit(v);
  await settle(() => requests[1].reject(new TypeError('Failed to fetch')));
  assert(column(v,'todo').querySelector('li')); assert.equal(v.container.querySelector('select[id^=move]').value,'review');
  assert.match(v.container.querySelector('[role=alert]').textContent, /Could not confirm/);
  await click(v,'Retry move'); assert.deepEqual(JSON.parse(requests[2].options.body),{status:'review'});
  await settle(() => requests[2].resolve(saved('review'))); assert(column(v,'review').querySelector('li')); await v.close();
 });
 for (const [status, code, message] of [[409,'project_archived',/archived/],[404,'issue_not_found',/no longer available/],[403,'csrf_failed',/could not be verified/],[422,'validation_error',/rejected/],[500,'internal_error',/Could not confirm/]]) {
  await check(`Rejected move ${status} retains saved status and explains failure`, async () => {
   const v = await mount(); await settle(() => requests[0].resolve(page())); await choose(v,'done'); await submit(v);
   await settle(() => requests[1].resolve(response(status,{error:{code}})));
   assert.match(v.container.querySelector('[role=alert]').textContent,message); assert(column(v,'todo').querySelector('li'));
   if(status===409 || status===404) assert(v.container.querySelector('select[id^=move]').disabled);
   await v.close();
  });
 }
 await check('Expired session redirects to safe board return URL', async () => {
  const v=await mount(); await settle(()=>requests[0].resolve(page())); await choose(v,'done'); await submit(v);
  await settle(()=>requests[1].resolve(response(401,{error:{code:'authentication_required'}})));
  assert.equal(redirects[0], `/login?next=${encodeURIComponent(`/projects/${projectId}?view=board`)}`); await v.close();
 });
 await check('Navigation failure after expired session remains a visible handled error', async () => {
  const v=await mount(); redirectError=new Error('Navigation failed');
  await settle(()=>requests[0].resolve(response(401,{error:{code:'authentication_required'}})));
  assert.match(v.container.querySelector('[role=alert]').textContent,/session expired/);
  redirectError=null; await v.close();
 });
 await check('Archived board is readable with disabled movement and no dragging', async () => {
  const v=await mount(Board,{...props,archived:true}); await settle(()=>requests[0].resolve(page()));
  assert.match(v.container.textContent,/read-only/); assert(v.container.querySelector('select[id^=move]').disabled);
  assert.equal(v.container.querySelector('li').draggable,false); await submit(v); assert.equal(requests.length,1); await v.close();
 });
 await check('Multiple pages, overlap deduplication, retry preserving cards, all statuses reachable', async () => {
  const statuses=['backlog','todo','in_progress','review','done'];
  const rows=Array.from({length:125},(_,i)=>({...issue,id:`id-${i}`,title:`Task ${i}`,status:statuses[i%5]}));
  const v=await mount(); await settle(()=>requests[0].resolve(page(rows.slice(0,100),true)));
  assert.equal(v.container.querySelectorAll('li').length,100); assert.match(v.container.textContent,/More issues are available/);
  await click(v,'Load older issues'); assert.match(requests[1].url,/offset=100$/);
  await settle(()=>requests[1].reject(new TypeError('offline'))); assert.equal(v.container.querySelectorAll('li').length,100);
  await click(v,'Try loading again'); assert.match(requests[2].url,/offset=100$/);
  await settle(()=>requests[2].resolve(page([rows[99],...rows.slice(100)])));
  assert.equal(v.container.querySelectorAll('li').length,125); assert.match(v.container.textContent,/All issues loaded/);
  for(const s of statuses) assert.equal(column(v,s).querySelectorAll('li').length,25);
  await v.close();
 });
 await check('Refresh retains old cards until success and replaces with saved API statuses', async () => {
  const v=await mount(); await settle(()=>requests[0].resolve(page())); await click(v,'Refresh board');
  assert(column(v,'todo').querySelector('li')); await settle(()=>requests[1].resolve(page([{...issue,status:'done'}])));
  assert(column(v,'done').querySelector('li')); assert(!column(v,'todo').querySelector('li')); await v.close();
 });
 await check('Strict Mode stale failures/success cannot overwrite current results; no abort signal', async () => {
  const v=await mount(Board,props,true); assert.equal(requests.length,2); assert(requests.every(r=>r.options.signal===undefined));
  await settle(()=>requests[1].resolve(page())); await settle(()=>requests[0].resolve(page([{...issue,status:'done'}])));
  assert(column(v,'todo').querySelector('li')); await choose(v,'done'); await submit(v); const last=requests.at(-1); await v.close();
  await settle(()=>last.reject(new TypeError('late network failure'))); assert.equal(redirects.length,0);
 });
 await check('Desktop drag uses same confirmed API; external drops are ignored', async () => {
  const v=await mount(); await settle(()=>requests[0].resolve(page()));
  const data={value:'',setData(_t,value){this.value=value},getData(){return this.value}};
  async function dragEvent(element,type){await settle(()=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:data});element.dispatchEvent(e);});}
  await dragEvent(column(v,'done'),'drop'); assert.equal(requests.length,1);
  await dragEvent(v.container.querySelector('li'),'dragstart'); await dragEvent(column(v,'done'),'dragover'); await dragEvent(column(v,'done'),'drop');
  assert.equal(requests.length,2); assert(column(v,'todo').querySelector('li'));
  await settle(()=>requests[1].resolve(saved('done'))); assert(column(v,'done').querySelector('li')); await v.close();
 });
 await check('List/Board navigation reflects URL, refetches, and agrees after movement', async () => {
  const v=await mount(Views); await settle(()=>requests[0].resolve(page())); await choose(v,'done'); await submit(v);
  await settle(()=>requests[1].resolve(saved('done')));
  assert.equal(v.container.querySelector('[aria-current=page]').textContent,'Board');
  window.history.replaceState({},'',`/projects/${projectId}`); await v.render(); assert.match(requests[2].url,/limit=20/);
  await settle(()=>requests[2].resolve(page([{...issue,status:'done'}])));
  assert.equal(v.container.querySelector('[aria-current=page]').textContent,'List'); assert.match(v.container.textContent,/Status: Done/);
  window.history.replaceState({},'',`/projects/${projectId}?view=board`); await v.render();
  await settle(()=>requests[3].resolve(page([{...issue,status:'done'}]))); assert(column(v,'done').querySelector('li')); await v.close();
 });
 await check('Move preserves API creation order including sub-millisecond timestamp differences', async () => {
  const newer={...issue,id:'newer',title:'Newer',status:'done',created_at:'2026-01-01T00:00:00.000002Z'};
  const v=await mount(); await settle(()=>requests[0].resolve(page([newer,issue]))); await choose(v,'done'); await submit(v);
  await settle(()=>requests[1].resolve(saved('done')));
  assert.deepEqual([...column(v,'done').querySelectorAll('h4')].map(x=>x.textContent),['Newer','Saved task']); await v.close();
 });
 await check('Initial loading failure has a working retry and mobile column selector is labeled', async () => {
  const v=await mount(); await settle(()=>requests[0].reject(new TypeError('offline'))); await click(v,'Try loading again');
  await settle(()=>requests[1].resolve(page()));
  const select=v.container.querySelector('#board-column'); assert(v.container.querySelector('label[for=board-column]'));
  await settle(()=>{select.value='review';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal(column(v,'review').dataset.selected,'true'); assert.equal(column(v,'todo').dataset.selected,'false'); await v.close();
 });
 console.log(`${passed} board checks passed; zero unhandled rejections. Simulated DOM/fetch/router, NOT real browser verification.`);
 dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1;dom.window.close();});
