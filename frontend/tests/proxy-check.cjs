// Real loopback upstream HTTP, plus simulated Vercel metadata. Not browser/edge verification.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
function load(file) {
  const mod = new Module(file); mod.paths = module.paths;
  mod.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, file);
  return mod.exports;
}
const { proxyConfig } = load(path.resolve(__dirname, '../lib/server/proxy-config.ts'));
const { forwardApi } = load(path.resolve(__dirname, '../lib/server/api-proxy.ts'));
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
let received, child;
const upstream = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  received = { url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() };
  const status = Number(new URL(req.url, 'http://local').searchParams.get('http_status') || 200);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Retry-After': '57',
    'Set-Cookie': req.url.includes('logout') ? ['devpilot_session=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/'] : ['devpilot_session=synthetic; HttpOnly; Secure; SameSite=Lax; Path=/', 'other=synthetic; Path=/'],
    'Cache-Control': 'public, max-age=3600' });
  res.end(JSON.stringify({ ok: true }));
});
async function main() {
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  process.env.API_PROXY_MODE = 'local';
  process.env.API_BACKEND_ORIGIN = `http://127.0.0.1:${upstream.address().port}`;
  delete process.env.VERCEL;
  let send = request => forwardApi(request);
  if (process.argv.includes('--next')) {
    const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit', windowsHide: true,
    });
    const origin = `http://127.0.0.1:${port}`;
    let ready = false, lastStatus;
    for (let n = 0; n < 100; n++) {
      try { const response = await fetch(origin + '/api/health'); lastStatus = response.status; await response.arrayBuffer(); if (response.ok) { ready = true; break; } } catch (error) { lastStatus = error.code ?? error.cause?.code ?? error.name; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, `Next production server should start (last status: ${lastStatus})`);
    send = request => fetch(origin + new URL(request.url).pathname + new URL(request.url).search,
      { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, duplex: 'half' });
  }
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
    await check(`${method}: query/body/cookie/origin forwarding and uncached response`, async () => {
      const body = ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify({ title: 'Text & Unicode café' });
      const response = await send(new Request('http://frontend/api/projects?q=a%26b&status=todo&status=done', {
        method, body, headers: { cookie: 'devpilot_session=synthetic', origin: 'https://frontend.example.com',
          'content-type': 'application/json', 'x-devpilot-proxy-secret': 'untrusted', 'x-devpilot-client-ip': '203.0.113.2',
          'x-forwarded-for': '203.0.113.3' },
      }));
      assert.equal(response.status, 200);
      assert.equal(received.url, '/api/projects?q=a%26b&status=todo&status=done');
      assert.equal(received.method, method); assert.equal(received.body, body ?? '');
      assert.equal(received.headers.cookie, 'devpilot_session=synthetic');
      assert.equal(received.headers.origin, 'https://frontend.example.com');
      assert.equal(received.headers['x-devpilot-proxy-secret'], undefined);
      assert.equal(received.headers['x-forwarded-for'], undefined);
      assert.equal(response.headers.getSetCookie().length, 2);
      assert.match(response.headers.getSetCookie()[0], /HttpOnly; Secure; SameSite=Lax/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('retry-after'), '57');
      await response.arrayBuffer();
    });
  }
  for (const status of [201, 204, 401, 403, 422, 429, 500, 503]) await check(`preserve upstream HTTP ${status}`, async () => {
    const response = await send(new Request(`http://frontend/api/check?http_status=${status}`));
    assert.equal(response.status, status); assert.equal(response.headers.get('retry-after'), '57');
    await response.arrayBuffer();
  });
  await check('logout cookie deletion is relayed', async () => {
    const response = await send(new Request('http://frontend/api/auth/logout?http_status=204', { method: 'POST' }));
    assert.equal(response.status, 204);
    assert.match(response.headers.getSetCookie()[0], /Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=\//);
  });
  await check('oversized mutation rejected', async () => {
    const result = await send(new Request('http://frontend/api/check', { method: 'POST', body: 'x'.repeat(131073) }));
    assert.equal(result.status, 413);
  });
  await check('redirect never followed', async () => {
    assert.equal((await send(new Request('http://frontend/api/check?http_status=302'))).status, 502);
  });
  if (!child) {
    await check('unsafe configuration rejected without exposing values', () => {
      for (const env of [ { NODE_ENV: 'production' }, { API_PROXY_MODE: 'local', VERCEL: '1' },
        { API_PROXY_MODE: 'local', API_BACKEND_ORIGIN: 'https://remote.example.com' },
        { API_PROXY_MODE: 'vercel', API_BACKEND_ORIGIN: 'https://remote.example.com' },
        { API_PROXY_MODE: 'local', API_BACKEND_ORIGIN: 'http://user:secret@localhost:8000' } ])
        assert.throws(() => proxyConfig(env));
    });
    await check('Vercel IP and secret replaced; malformed IP fails closed', async () => {
      const fetchOriginal = global.fetch;
      process.env.API_PROXY_MODE = 'vercel'; process.env.VERCEL = '1';
      process.env.API_BACKEND_ORIGIN = 'https://backend.example.com';
      process.env.API_PROXY_SECRET = 'a'.repeat(64); // Public fixture only.
      let sent;
      global.fetch = async (_url, options) => { sent = options; return Response.json({ ok: true }); };
      try {
        const result = await forwardApi(new Request('https://frontend/api/check', { headers: {
          'x-forwarded-for': '203.0.113.4', 'x-devpilot-client-ip': '198.51.100.1', 'x-devpilot-proxy-secret': 'attacker',
        } }));
        assert.equal(result.status, 200);
        assert.equal(sent.headers.get('x-devpilot-client-ip'), '203.0.113.4');
        assert.equal(sent.headers.get('x-devpilot-proxy-secret'), process.env.API_PROXY_SECRET);
        for (const ip of ['', '203.0.113.1, 203.0.113.2', 'bad', 'fe80::1%eth0'])
          assert.equal((await forwardApi(new Request('https://frontend/api/check', { headers: { 'x-forwarded-for': ip } }))).status, 503);
      } finally { global.fetch = fetchOriginal; process.env.API_PROXY_MODE = 'local'; delete process.env.VERCEL; }
    });
    await check('transport failure is handled without retry', async () => {
      process.env.API_BACKEND_ORIGIN = 'http://127.0.0.1:1';
      const result = await forwardApi(new Request('http://frontend/api/auth/login', { method: 'POST', body: '{}' }));
      assert.equal(result.status, 503); assert.equal((await result.json()).error.code, 'proxy_unavailable');
    });
  }
  console.log(`${passed} proxy checks passed (${child ? 'Next production HTTP -> loopback upstream' : 'handler + HTTP + simulated Vercel metadata'}); NOT real browser/platform verification.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child) { const ended = once(child, 'exit'); child.kill(); await ended; }
  upstream.closeAllConnections(); upstream.close();
});
