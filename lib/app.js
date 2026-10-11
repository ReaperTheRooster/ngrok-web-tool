'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  ValidationError,
  validateId,
  validateTunnelName,
  validateTunnelInput,
  parseLimit,
} = require('./validate');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const MAX_BODY_BYTES = 16 * 1024;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function sendJson(res, status, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ValidationError('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ValidationError('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Reject cross-site requests: this API starts tunnels, so a malicious page
// must not be able to drive it from the user's browser.
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function buildRoutes(agent) {
  return [
    ['GET', /^\/api\/status$/, async () => agent.status()],
    ['GET', /^\/api\/tunnels$/, async () => agent.listTunnels()],
    ['POST', /^\/api\/tunnels$/, async ({ body }) => agent.startTunnel(validateTunnelInput(body)), 201],
    [
      'DELETE',
      /^\/api\/tunnels\/([^/]+)$/,
      async ({ params }) => agent.stopTunnel(validateTunnelName(params[0])),
      204,
    ],
    [
      'GET',
      /^\/api\/requests$/,
      async ({ query }) =>
        agent.listRequests({
          limit: parseLimit(query.get('limit')),
          tunnelName: query.get('tunnel') ? validateTunnelName(query.get('tunnel')) : undefined,
        }),
    ],
    ['DELETE', /^\/api\/requests$/, async () => agent.clearRequests(), 204],
    ['GET', /^\/api\/requests\/([^/]+)$/, async ({ params }) => agent.getRequest(validateId(params[0]))],
    [
      'POST',
      /^\/api\/requests\/([^/]+)\/replay$/,
      async ({ params, body }) =>
        agent.replayRequest(
          validateId(params[0]),
          body?.tunnelName ? validateTunnelName(body.tunnelName) : undefined,
        ),
      204,
    ],
  ];
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'",
    });
    res.end(data);
  });
}

function createApp({ agent }) {
  const routes = buildRoutes(agent);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res, pathname);
    }

    try {
      if (req.method !== 'GET' && !isSameOrigin(req)) {
        return sendJson(res, 403, { error: 'Cross-origin request rejected' });
      }
      for (const [method, pattern, handler, okStatus = 200] of routes) {
        const match = pattern.exec(pathname);
        if (method !== req.method || !match) continue;
        const body = method === 'POST' ? await readJson(req) : undefined;
        const params = match.slice(1).map(decodeURIComponent);
        const result = await handler({ params, body, query: url.searchParams });
        return sendJson(res, okStatus, okStatus === 204 ? undefined : result);
      }
      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500 && !err.status) console.error(err);
      sendJson(res, status, { error: err.message });
    }
  });
}

module.exports = { createApp };
