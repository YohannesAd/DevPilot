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
window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
window.HTMLDialogElement.prototype.close=function(){this.open=false};
const CommentForm=load(path.join(frontend,'components/CommentForm.tsx')).default;
const Comments=load(path.join(frontend,'components/IssueComments.tsx')).default;
const LabelForm=load(path.join(frontend,'components/LabelForm.tsx')).default;
const Labels=load(path.join(frontend,'components/ProjectLabels.tsx')).default;
const IssueLabels=load(path.join(frontend,'components/IssueLabels.tsx')).default;
const Badges=load(path.join(frontend,'components/LabelBadges.tsx')).default;
const Board=load(path.join(frontend,'components/IssueBoard.tsx')).default;
const List=load(path.join(frontend,'components/ProjectIssues.tsx')).default;
const projectId='11111111-1111-4111-8111-111111111111',issueId='22222222-2222-4222-8222-222222222222';
const label={id:'label-one',project_id:projectId,name:'Frontend',color:'purple'};
const comment={id:'comment-one',issue_id:issueId,body:'<script>text only</script>',author:{id:'owner',display_name:'Owner'},created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',edited:false};
const issue={id:issueId,project_id:projectId,title:'Task',type:'task',priority:'high',status:'todo',description:null,labels:[label],created_at:comment.created_at,updated_at:comment.updated_at};
const rootPath=`/api/projects/${projectId}/issues/${issueId}/comments`;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
const page=(items,has_more=false)=>response(200,{items,has_more});
global.fetch=(url,options={})=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));
async function settle(fn){await act(async()=>{fn?.();await tick()})}
async function mount(Component,props,strict=false){
 requests=[];redirects=[];window.history.replaceState({},'',`/projects/${projectId}/issues/${issueId}`);
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(React.createElement(strict?React.StrictMode:React.Fragment,null,React.createElement(Component,props))));
 return {container,close:async()=>{await act(async()=>root.unmount());container.remove()}};
}
async function fill(el,value){await settle(()=>{const prototype=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}))})}
async function submit(v,index=0){await settle(()=>v.container.querySelectorAll('form')[index].dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))}
async function click(v,text){await settle(()=>{const b=[...v.container.querySelectorAll('button')].find(x=>x.textContent===text);assert(b,`Missing ${text}`);b.click()})}
let passed=0;
async function check(name,fn){await fn();await tick();assert.equal(unhandled.length,0);passed++;console.log('PASS '+name)}
(async()=>{
 await check('Comment limits, trimming, duplicate-submit guard and draft reset only on success',async()=>{
  let saved;const v=await mount(CommentForm,{path:rootPath,onSaved:c=>saved=c});
  await submit(v);assert.equal(requests.length,0);assert.match(v.container.textContent,/1 and 5,000/);
  await fill(v.container.querySelector('textarea'),'x'.repeat(5001));await submit(v);assert.equal(requests.length,0);
  await fill(v.container.querySelector('textarea'),'  Hello world  ');await submit(v);await submit(v);
  assert.equal(requests.length,1);assert.deepEqual(JSON.parse(requests[0].options.body),{body:'Hello world'});
  await settle(()=>requests[0].resolve(response(201,{...comment,body:'Hello world'})));
  assert.equal(saved.body,'Hello world');assert.equal(v.container.querySelector('textarea').value,'');await v.close();
 });
 for(const [status,code,pattern]of [[0,'',/could not confirm/],[409,'project_archived',/archived/],[403,'csrf_failed',/could not be verified/],[422,'validation_error',/Check the text/]]){
  await check(`Comment failure ${status} keeps draft and permits retry`,async()=>{
   const v=await mount(CommentForm,{path:rootPath,onSaved(){}});await fill(v.container.querySelector('textarea'),'Keep my draft');await submit(v);
   await settle(()=>status?requests[0].resolve(response(status,{error:{code}})):requests[0].reject(new TypeError('offline')));
   assert.equal(v.container.querySelector('textarea').value,'Keep my draft');assert.match(v.container.querySelector('[role=alert]').textContent,pattern);await v.close();
  });
 }
 await check('Comment edit uses PATCH with saved values; late failure ignored after unmount',async()=>{
  const v=await mount(CommentForm,{path:rootPath,comment,onSaved(){}});assert.equal(v.container.querySelector('textarea').value,comment.body);
  await fill(v.container.querySelector('textarea'),'Edited');await submit(v);assert.equal(requests[0].options.method,'PATCH');
  const request=requests[0];await v.close();await settle(()=>request.reject(new TypeError('late')));
 });
 await check('Comments render text/author/edited time, page chronologically and archive disables writes',async()=>{
  const v=await mount(Comments,{projectId,issueId,archived:true});await settle(()=>requests[0].resolve(page([{...comment,edited:true}],true)));
  assert.equal(v.container.querySelectorAll('script').length,0);assert.match(v.container.textContent,/Owner/);assert.match(v.container.textContent,/Edited/);
  assert.equal(v.container.querySelectorAll('textarea').length,0);assert(![...v.container.querySelectorAll('button')].some(x=>x.textContent==='Delete comment'));
  await click(v,'Newer comments');assert.match(requests[1].url,/offset=20/);await settle(()=>requests[1].resolve(page([])));await click(v,'Older comments');assert.match(requests[2].url,/offset=0/);await v.close();
 });
 await check('Own comment deletion requires confirmation, keeps errors, restores focus and refreshes comments only',async()=>{
  const v=await mount(Comments,{projectId,issueId,archived:false});await settle(()=>requests[0].resolve(page([comment])));
  const opener=[...v.container.querySelectorAll('button')].find(x=>x.textContent==='Delete comment');opener.focus();await click(v,'Delete comment');
  assert(v.container.querySelector('dialog').open);assert.equal(document.activeElement.textContent,'Keep comment');assert.equal(requests.length,1);
  await click(v,'Keep comment');assert.equal(document.activeElement,opener);await click(v,'Delete comment');
  await settle(()=>v.container.querySelector('dialog button:last-child').click());assert.equal(requests[1].options.method,'DELETE');
  await settle(()=>requests[1].reject(new TypeError('offline')));assert(v.container.querySelector('dialog'));assert.match(v.container.querySelector('dialog').textContent,/could not confirm/);
  await settle(()=>v.container.querySelector('dialog button:last-child').click());await settle(()=>requests[2].resolve(response(204)));
  assert.match(requests[3].url,/\/comments\?/);assert.equal(document.activeElement.id,'comments-heading');await settle(()=>requests[3].resolve(page([])));assert.match(v.container.textContent,/Comment deleted/);await v.close();
 });
 await check('Other authors have no edit/delete actions',async()=>{
  const v=await mount(Comments,{projectId,issueId,archived:false});await settle(()=>requests[0].resolve(page([{...comment,author:{id:'other',display_name:'Other'}}])));
  assert(![...v.container.querySelectorAll('button')].some(x=>x.textContent==='Delete comment'||x.textContent==='Edit comment'));await v.close();
 });
 await check('Label validation, palette, uniqueness error, rename and retained name',async()=>{
  let saved;const v=await mount(LabelForm,{projectId,onSaved:x=>saved=x});assert.equal(v.container.querySelectorAll('option').length,6);
  await fill(v.container.querySelector('input'),'x'.repeat(31));await submit(v);assert.equal(requests.length,0);
  await fill(v.container.querySelector('input'),' Frontend ');await submit(v);await submit(v);assert.equal(requests.length,1);
  await settle(()=>requests[0].resolve(response(409,{error:{code:'label_name_taken'}})));assert.equal(v.container.querySelector('input').value,' Frontend ');assert.match(v.container.textContent,/already exists/);
  await fill(v.container.querySelector('input'),'UI');await submit(v);await settle(()=>requests[1].resolve(response(201,{...label,name:'UI'})));assert.equal(saved.name,'UI');await v.close();
  const edit=await mount(LabelForm,{projectId,label,onSaved(){}});assert.equal(edit.container.querySelector('input').value,'Frontend');await submit(edit);assert.equal(requests[0].options.method,'PATCH');await edit.close();
 });
 await check('Project label deletion confirmation preserves issues and archived labels are read-only',async()=>{
  const v=await mount(Labels,{projectId,archived:false});await settle(()=>requests[0].resolve(page([label])));await click(v,'Delete Frontend');
  assert.match(v.container.querySelector('dialog').textContent,/issues themselves are preserved/);assert.equal(requests.length,1);await click(v,'Delete label');
  assert.equal(requests[1].options.method,'DELETE');await settle(()=>requests[1].resolve(response(204)));await settle(()=>requests[2].resolve(page([])));assert.match(v.container.textContent,/Issues were preserved/);await v.close();
  const a=await mount(Labels,{projectId,archived:true});await settle(()=>requests[0].resolve(page([label])));assert.equal(a.container.querySelectorAll('form').length,0);assert.match(a.container.textContent,/read-only/);await a.close();
 });
 await check('Assignments use confirmed PUT/DELETE and do not refetch project; all label pages accessible',async()=>{
  function Wrapper(){const [labels,setLabels]=React.useState([]);return React.createElement(IssueLabels,{projectId,issueId,labels,archived:false,onSaved:setLabels})}
  const v=await mount(Wrapper);await settle(()=>requests[0].resolve(page([label],true)));await click(v,'Assign Frontend');await click(v,'Assign Frontend');assert.equal(requests.length,2);
  assert.equal(requests[1].options.method,'PUT');await settle(()=>requests[1].resolve(response(200,[label])));assert.equal(requests.length,2);assert.match(v.container.textContent,/Remove Frontend/);
  await click(v,'Remove Frontend');assert.equal(requests[2].options.method,'DELETE');await settle(()=>requests[2].resolve(response(200,[])));
  assert.equal(document.activeElement.id,'issue-labels-heading');await click(v,'Next labels');assert.match(requests[3].url,/offset=20/);await v.close();
 });
 await check('Assignment rejection preserves labels; archived detail never loads mutation choices',async()=>{
  const v=await mount(IssueLabels,{projectId,issueId,labels:[label],archived:false,onSaved(){}});await settle(()=>requests[0].resolve(page([label])));await click(v,'Remove Frontend');
  await settle(()=>requests[1].resolve(response(404,{error:{code:'label_not_found'}})));assert.match(v.container.textContent,/Remove Frontend/);assert.match(v.container.textContent,/no longer available/);await v.close();
  const a=await mount(IssueLabels,{projectId,issueId,labels:[label],archived:true,onSaved(){}});assert.equal(requests.length,0);assert.match(a.container.textContent,/Frontend/);assert.equal(a.container.querySelectorAll('button').length,0);await a.close();
 });
 await check('Shared label names safely render on list and board cards',async()=>{
  for(const Component of [List,Board]){const v=await mount(Component,{projectId,archived:false});await settle(()=>requests[0].resolve(page([{...issue,labels:[{...label,name:'<b>Plain</b>'}]}])));
   assert.match(v.container.textContent,/<b>Plain<\/b>/);assert.equal(v.container.querySelectorAll('b').length,0);assert(v.container.querySelector('[aria-label=Labels]'));await v.close()}
 });
 await check('Expired-session mutation redirects safely and Strict Mode stale list results are ignored',async()=>{
  const v=await mount(CommentForm,{path:rootPath,onSaved(){}});await fill(v.container.querySelector('textarea'),'Draft');await submit(v);await settle(()=>requests[0].resolve(response(401,{error:{code:'authentication_required'}})));assert.match(redirects[0],/^\/login\?next=/);await v.close();
  const l=await mount(Labels,{projectId,archived:true},true);assert.equal(requests.length,2);await settle(()=>requests[1].resolve(page([label])));await settle(()=>requests[0].resolve(page([])));assert.match(l.container.textContent,/Frontend/);await l.close();
 });
 console.log(`${passed} organization checks passed; zero unhandled rejections. Simulated DOM/fetch/router, NOT browser verification.`);dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1;dom.window.close()});
