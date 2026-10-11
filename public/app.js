'use strict';

const $ = (sel) => document.querySelector(sel);
const POLL_MS = 3000;

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Build DOM nodes instead of using innerHTML so tunnel/request data cannot inject markup.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function showError(message) {
  $('#form-error').textContent = message || '';
}

async function refreshStatus() {
  const badge = $('#agent-status');
  try {
    const s = await api('GET', '/api/status');
    badge.textContent = s.online ? 'agent online' : 'agent offline';
    badge.className = `badge ${s.online ? 'online' : 'offline'}`;
    badge.title = s.error || '';
    return s.online;
  } catch {
    badge.textContent = 'server unreachable';
    badge.className = 'badge offline';
    return false;
  }
}

function renderTunnels(tunnels) {
  const body = $('#tunnels tbody');
  body.replaceChildren(
    ...tunnels.map((t) =>
      el('tr', {},
        el('td', {}, t.name),
        el('td', {}, /^https?:\/\//.test(t.publicUrl)
          ? el('a', { href: t.publicUrl, target: '_blank', rel: 'noopener noreferrer' }, t.publicUrl)
          : t.publicUrl),
        el('td', { class: 'mono' }, String(t.addr ?? '')),
        el('td', {}, String(t.requestCount)),
        el('td', { class: 'actions' },
          el('button', { class: 'danger', onclick: () => stopTunnel(t.name) }, 'Stop')),
      ),
    ),
  );
  $('#tunnels-empty').hidden = tunnels.length > 0;
}

function renderRequests(requests) {
  const body = $('#requests tbody');
  body.replaceChildren(
    ...requests.map((r) =>
      el('tr', {},
        el('td', {}, r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : ''),
        el('td', {}, r.method || ''),
        el('td', { class: 'mono' }, r.uri || ''),
        el('td', { class: r.status ? `s${String(r.status)[0]}` : '' }, String(r.status ?? '')),
        el('td', {}, String(r.durationMs ?? '')),
        el('td', { class: 'actions' },
          el('button', { class: 'secondary', onclick: () => showRequest(r.id) }, 'Details'),
          ' ',
          el('button', { class: 'secondary', onclick: () => replay(r.id) }, 'Replay')),
      ),
    ),
  );
  $('#requests-empty').hidden = requests.length > 0;
}

async function refresh() {
  if (!(await refreshStatus())) {
    renderTunnels([]);
    renderRequests([]);
    return;
  }
  try {
    const [tunnels, requests] = await Promise.all([api('GET', '/api/tunnels'), api('GET', '/api/requests?limit=30')]);
    renderTunnels(tunnels);
    renderRequests(requests);
  } catch (err) {
    showError(err.message);
  }
}

async function stopTunnel(name) {
  if (!confirm(`Stop tunnel "${name}"?`)) return;
  try {
    await api('DELETE', `/api/tunnels/${encodeURIComponent(name)}`);
    showError('');
  } catch (err) {
    showError(err.message);
  }
  refresh();
}

async function showRequest(id) {
  const pre = $('#request-detail');
  try {
    pre.textContent = JSON.stringify(await api('GET', `/api/requests/${encodeURIComponent(id)}`), null, 2);
    pre.hidden = false;
  } catch (err) {
    showError(err.message);
  }
}

async function replay(id) {
  try {
    await api('POST', `/api/requests/${encodeURIComponent(id)}/replay`, {});
    showError('');
  } catch (err) {
    showError(err.message);
  }
  refresh();
}

$('#tunnel-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('POST', '/api/tunnels', Object.fromEntries(new FormData(form)));
    form.reset();
    showError('');
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
  }
  refresh();
});

$('#clear-requests').addEventListener('click', async () => {
  try {
    await api('DELETE', '/api/requests');
    $('#request-detail').hidden = true;
  } catch (err) {
    showError(err.message);
  }
  refresh();
});

refresh();
setInterval(refresh, POLL_MS);
