'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { NgrokAgent } = require('../lib/ngrok');
const { createApp } = require('../lib/app');

// Fake ngrok agent API recording the calls it receives.
function startFakeAgent() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET' && req.url === '/api/tunnels') {
        return res.end(JSON.stringify({ tunnels: [{ name: 'web', proto: 'https', public_url: 'https://x.ngrok.app', config: { addr: 'http://localhost:80' }, metrics: { http: { count: 3 } } }] }));
      }
      if (req.method === 'POST' && req.url === '/api/tunnels') {
        return res.writeHead(201).end(JSON.stringify({ name: 'new', proto: 'https', public_url: 'https://n.ngrok.app', config: { addr: 'http://localhost:9' } }));
      }
      if (req.method === 'GET' && req.url.startsWith('/api/requests/http?')) {
        return res.end(JSON.stringify({ requests: [{ id: 'r1', tunnel_name: 'web', start: '2026-01-01T00:00:00Z', duration: 5e6, request: { method: 'GET', uri: '/' }, response: { status_code: 200 } }] }));
      }
      if (req.method === 'DELETE' && req.url === '/api/tunnels/missing') {
        return res.writeHead(404).end(JSON.stringify({ msg: 'tunnel not found' }));
      }
      res.writeHead(204).end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, port: server.address().port })));
}

async function setup(t) {
  const fake = await startFakeAgent();
  const agent = new NgrokAgent({ baseUrl: `http://127.0.0.1:${fake.port}`, timeoutMs: 1000 });
  const app = createApp({ agent });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  t.after(() => { app.close(); fake.server.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  return { base, calls: fake.calls };
}

test('lists tunnels in summarized form', async (t) => {
  const { base } = await setup(t);
  const res = await fetch(`${base}/api/tunnels`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [{ name: 'web', proto: 'https', publicUrl: 'https://x.ngrok.app', addr: 'http://localhost:80', startedAt: null, requestCount: 3 }]);
});

test('starts a tunnel with validated payload only', async (t) => {
  const { base, calls } = await setup(t);
  const res = await fetch(`${base}/api/tunnels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'new', addr: '9', inspect: false }),
  });
  assert.equal(res.status, 201);
  assert.deepEqual(calls.at(-1).body, { name: 'new', proto: 'http', addr: '9' });
});

test('rejects invalid tunnel input with 400', async (t) => {
  const { base } = await setup(t);
  const res = await fetch(`${base}/api/tunnels`, { method: 'POST', body: JSON.stringify({ name: '../x', addr: '1' }) });
  assert.equal(res.status, 400);
});

test('rejects cross-origin mutations', async (t) => {
  const { base } = await setup(t);
  const res = await fetch(`${base}/api/tunnels`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
    body: JSON.stringify({ name: 'a', addr: '1' }),
  });
  assert.equal(res.status, 403);
});

test('propagates agent errors and reports status', async (t) => {
  const { base } = await setup(t);
  const del = await fetch(`${base}/api/tunnels/missing`, { method: 'DELETE' });
  assert.equal(del.status, 404);
  assert.equal((await del.json()).error, 'tunnel not found');
  assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { online: true, tunnelCount: 1 });
});

test('lists requests and replays one', async (t) => {
  const { base, calls } = await setup(t);
  const list = await (await fetch(`${base}/api/requests?limit=5`)).json();
  assert.equal(list[0].durationMs, 5);
  assert.match(calls.at(-1).url, /limit=5/);
  const replay = await fetch(`${base}/api/requests/r1/replay`, { method: 'POST', body: '{}' });
  assert.equal(replay.status, 204);
  assert.deepEqual(calls.at(-1).body, { id: 'r1' });
});

test('reports offline agent as 503', async () => {
  const agent = new NgrokAgent({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 });
  const app = createApp({ agent });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal((await fetch(`${base}/api/tunnels`)).status, 503);
  assert.equal((await (await fetch(`${base}/api/status`)).json()).online, false);
  app.close();
});

test('serves static files and blocks traversal', async (t) => {
  const { base } = await setup(t);
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /ngrok Web Tool/);
  const bad = await fetch(`${base}/..%2Fpackage.json`);
  assert.notEqual(bad.status, 200);
});
