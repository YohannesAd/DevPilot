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
const Views = load(path.join(frontend, 'components/ProjectIssueViews.tsx')).default;
const Board = load(path.join(frontend, 'components/IssueBoard.tsx')).default;
const Dashboard = load(path.join(frontend, 'components/Dashboard.tsx')).default;
const Filters = load(path.join(frontend, 'components/IssueFilters.tsx')).default;
const { readIssueFilters, filterQuery, projectViewHref } = load(path.join(frontend, 'lib/issueFilters.ts'));
router.push = href => redirects.push(href);
const projectId = '11111111-1111-4111-8111-111111111111';
const labelId = '33333333-3333-4333-8333-333333333333';
const issue = { id: '22222222-2222-4222-8222-222222222222', project_id: projectId, title: 'Matching task', type: 'task', priority: 'urgent', status: 'todo', labels: [], description: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const page = (items = [], has_more = false) => response(200, { items, has_more });
global.fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
async function settle(fn) { await act(async () => { fn?.(); await tick(); }); }
async function mount(Component, supplied = {}, query = '', strict = false) {
  requests = []; redirects = [];
  window.history.replaceState({}, '', `/projects/${projectId}${query}`);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const render = () => act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(Component, supplied))));
  await render();
  return { container, render, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}
const issueRequests = () => requests.filter(r => /\/issues\?/.test(r.url));
const labelRequests = () => requests.filter(r => /\/labels\?/.test(r.url));
const click = (v, text) => settle(() => { const b = [...v.container.querySelectorAll('button')].find(x => x.textContent === text); assert(b, text); b.click(); });
const select = (v, selector, value) => settle(() => { const s = v.container.querySelector(selector); s.value = value; s.dispatchEvent(new window.Event('change', { bubbles: true })); });
const submit = (v, selector = 'form') => settle(() => v.container.querySelector(selector).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
let passed = 0;
async function check(name, run) { await run(); await tick(); assert.equal(unhandled.length, 0); passed++; console.log(`PASS ${name}`); }
(async () => {
 await check('Canonical URL contract retains every filter across all project views', async () => {
  const filters = { status:'todo', priority:'urgent', type:'task', label_id:labelId, q:'100%_ & title' };
  for (const view of ['list','board','labels']) {
   const params = new URL(projectViewHref(projectId,view,filters),'http://localhost').searchParams;
   assert.deepEqual(readIssueFilters(params), filters);
   assert.equal(params.get('view'),view==='list'?null:view);
  }
  assert.equal(filterQuery({status:'',q:''}),'');
 });
 await check('Apply uses history navigation, trimmed search, and Clear resets unapplied drafts', async () => {
  const v=await mount(Filters,{projectId,view:'board',filters:{q:'  100%_  '}});
  await settle(()=>requests[0].resolve(page()));
  await select(v,'#filter-status','review'); await submit(v);
  const url=new URL(redirects[0],'http://localhost');
  assert.equal(url.searchParams.get('q'),'100%_'); assert.equal(url.searchParams.get('status'),'review'); assert.equal(url.searchParams.get('view'),'board');
  await settle(()=>{ const a=[...v.container.querySelectorAll('a')].find(x=>x.textContent==='Clear filters'); a.addEventListener('click',e=>e.preventDefault()); a.click(); });
  assert.equal(v.container.querySelector('#filter-search').value,''); assert.equal(v.container.querySelector('#filter-status').value,''); await v.close();
 });
 await check('Overlong search stays in form with validation and no navigation', async () => {
  const v=await mount(Filters,{projectId,view:'list',filters:{q:'x'.repeat(201)}}); await submit(v);
  assert.match(v.container.textContent,/200 characters/); assert.equal(redirects.length,0); await v.close();
 });
 await check('Bounded label choices page without losing selected label; failures retry', async () => {
  const v=await mount(Filters,{projectId,view:'list',filters:{}});
  await settle(()=>requests[0].resolve(page([{id:labelId,name:'Release',color:'blue'}],true)));
  await select(v,'#filter-label',labelId); await click(v,'More labels');
  assert.match(requests[1].url,/limit=20&offset=20/);
  await settle(()=>requests[1].reject(new TypeError('Failed to fetch'))); assert.match(v.container.textContent,/could not load/);
  await click(v,'Retry labels'); await settle(()=>requests[2].resolve(page()));
  assert.equal(v.container.querySelector('#filter-label').value,labelId); assert.match(v.container.textContent,/Release/); await v.close();
 });
 await check('List and Board send identical filters, reset pagination, and preserve URL links', async () => {
  const query=`?status=todo&priority=urgent&type=task&label_id=${labelId}&q=Matching`;
  const v=await mount(Views,{projectId,archived:false},query);
  await settle(()=>{labelRequests()[0].resolve(page());issueRequests()[0].resolve(page([issue],true));});
  await click(v,'Next'); assert.match(issueRequests()[1].url,/offset=20/);
  const boardLink=[...v.container.querySelectorAll('a')].find(x=>x.textContent==='Board').getAttribute('href');
  window.history.replaceState({},'',boardLink); await v.render();
  assert.match(issueRequests()[2].url,/limit=100&offset=0/);
  for(const key of ['status','priority','type','label_id','q']) assert.equal(new URL(issueRequests()[0].url, 'http://localhost:3000').searchParams.get(key),new URL(issueRequests()[2].url, 'http://localhost:3000').searchParams.get(key));
  await settle(()=>issueRequests()[2].resolve(page([issue]))); assert.match(v.container.textContent,/Matching task/);
  window.history.replaceState({},'',`/projects/${projectId}${query}`); await v.render();
  assert.match(issueRequests()[3].url,/limit=20&offset=0/); await settle(()=>issueRequests()[3].resolve(page([issue])));
  assert.equal(v.container.querySelector('#filter-status').value,'todo'); await v.close();
 });
 await check('Changed URL discards old requests, updates controls, and resets list pagination', async () => {
  const v=await mount(Views,{projectId,archived:false},'?status=todo'); const old=issueRequests()[0];
  window.history.replaceState({},'',`/projects/${projectId}?status=done`); await v.render();
  const current=issueRequests()[1]; assert.match(current.url,/offset=0&status=done/);
  await settle(()=>current.resolve(page([{...issue,status:'done',title:'Newest match'}])));
  await settle(()=>old.resolve(page([{...issue,title:'Stale match'}])));
  assert.match(v.container.textContent,/Newest match/); assert.doesNotMatch(v.container.textContent,/Stale match/);
  assert.equal(v.container.querySelector('#filter-status').value,'done'); await v.close();
 });
 for(const view of ['list','board']) await check(`${view} distinguishes no matches from an empty project`,async()=>{
  const v=await mount(Views,{projectId,archived:false},`?view=${view}&q=missing`);
  await settle(()=>issueRequests()[0].resolve(page())); assert.match(v.container.textContent,/No matching issues/);
  window.history.replaceState({},'',`/projects/${projectId}?view=${view}`); await v.render();
  await settle(()=>issueRequests()[1].resolve(page())); assert.match(v.container.textContent,/No issues yet/); await v.close();
 });
 await check('Invalid URL filters remain visible and recoverable',async()=>{
  const v=await mount(Views,{projectId,archived:false},'?status=invalid');
  await settle(()=>issueRequests()[0].resolve(response(422,{error:{code:'validation_error'}})));
  assert.match(v.container.textContent,/filters are invalid/); assert.equal(v.container.querySelector('#filter-status').value,'invalid'); assert.match(v.container.textContent,/Clear filters/); await v.close();
 });
 await check('Confirmed filtered move removes card, announces and focuses, corrects next offset',async()=>{
  const v=await mount(Board,{projectId,archived:false,filters:{status:'todo'}});
  const rows=Array.from({length:100},(_,i)=>({...issue,id:i?`row-${i}`:issue.id}));
  await settle(()=>requests[0].resolve(page(rows,true)));
  await select(v,`#move-${issue.id}`,'done'); await submit(v);
  assert(v.container.querySelector(`#board-issue-${issue.id}`));
  await settle(()=>requests[1].resolve(response(200,{...issue,status:'done'})));
  assert(!v.container.querySelector(`#board-issue-${issue.id}`)); assert.match(v.container.textContent,/no longer matches/); assert.equal(document.activeElement.id,'board-heading');
  await click(v,'Load older issues'); assert.match(requests[2].url,/offset=99&status=todo/); await v.close();
 });
 await check('Strict Mode old failures after unmount remain handled without AbortController',async()=>{
  const v=await mount(Views,{projectId,archived:false},'?status=todo',true); await v.close();
  await settle(()=>requests.forEach(r=>{assert.equal(r.options.signal,undefined);r.reject(new TypeError('late failure'));}));
 });
 const empty={active_projects:0,total_issues:0,status_counts:{backlog:0,todo:0,in_progress:0,review:0,done:0},recent_projects:[],recent_issues:[]};
 await check('Dashboard renders provided totals, five statuses and working bounded recent links',async()=>{
  const v=await mount(Dashboard); assert.match(v.container.textContent,/Loading your active work/); assert.match(requests[0].url,/\/api\/dashboard$/);
  await settle(()=>requests[0].resolve(response(200,{...empty,active_projects:3,total_issues:41,status_counts:{...empty.status_counts,todo:40,done:1},recent_projects:[{id:projectId,name:'Saved project',updated_at:issue.updated_at}],recent_issues:[{...issue,project_name:'Saved project'}]})));
  assert.deepEqual([...v.container.querySelectorAll('dd')].map(x=>x.textContent),['3','41','0','40','0','0','1']);
  assert(v.container.querySelector(`a[href="/projects/${projectId}/issues/${issue.id}"]`)); assert(v.container.querySelector(`a[href="/projects/${projectId}"]`));
  assert.match(v.container.textContent,/Archived projects and their issues are excluded/); assert.equal(requests.length,1); await v.close();
 });
 await check('Dashboard empty state, refresh error and retry preserve recoverability',async()=>{
  const v=await mount(Dashboard); await settle(()=>requests[0].resolve(response(200,empty)));
  assert.match(v.container.textContent,/No active projects yet/); assert(v.container.querySelector('a[href="/projects?create=1#new-project"]'));
  await click(v,'Refresh dashboard'); await settle(()=>requests[1].reject(new TypeError('Failed to fetch')));
  assert.match(v.container.textContent,/dashboard couldn/); await click(v,'Try again'); await settle(()=>requests[2].resolve(response(200,empty)));
  assert.match(v.container.textContent,/No active projects yet/); await v.close();
 });
 await check('Dashboard expired session redirects with return URL and handles late results',async()=>{
  const v=await mount(Dashboard); await settle(()=>requests[0].resolve(response(401,{error:{code:'authentication_required'}})));
  assert.match(redirects[0],/^\/login\?next=/); await v.close();
 });
 console.log(`${passed} filtering/dashboard checks passed; zero unhandled rejections. Simulated React DOM/fetch/router, NOT real browser verification.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
