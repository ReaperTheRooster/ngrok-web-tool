'use strict';

// Thin client for the local ngrok agent API (https://ngrok.com/docs/agent/api/).

class AgentError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'AgentError';
    this.status = status;
    this.details = details;
  }
}

class NgrokAgent {
  constructor({ baseUrl, timeoutMs = 5000, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(this.baseUrl + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err.name === 'AbortError' ? 'timed out' : 'unreachable';
      throw new AgentError(`ngrok agent ${reason} at ${this.baseUrl}`, 503);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    if (!res.ok) {
      throw new AgentError(data?.msg || `ngrok agent returned ${res.status}`, res.status, data);
    }
    return data;
  }

  async status() {
    try {
      const data = await this.request('GET', '/api/tunnels');
      return { online: true, tunnelCount: data.tunnels.length };
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async listTunnels() {
    const data = await this.request('GET', '/api/tunnels');
    return data.tunnels.map(summarizeTunnel);
  }

  async startTunnel(input) {
    const data = await this.request('POST', '/api/tunnels', input);
    return summarizeTunnel(data);
  }

  async stopTunnel(name) {
    await this.request('DELETE', `/api/tunnels/${encodeURIComponent(name)}`);
  }

  async listRequests({ limit = 50, tunnelName } = {}) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (tunnelName) qs.set('tunnel_name', tunnelName);
    const data = await this.request('GET', `/api/requests/http?${qs}`);
    return (data.requests || []).map(summarizeRequest);
  }

  async getRequest(id) {
    const data = await this.request('GET', `/api/requests/http/${encodeURIComponent(id)}`);
    return data;
  }

  async replayRequest(id, tunnelName) {
    const body = { id };
    if (tunnelName) body.tunnel_name = tunnelName;
    await this.request('POST', '/api/requests/http', body);
  }

  async clearRequests() {
    await this.request('DELETE', '/api/requests/http');
  }
}

function summarizeTunnel(t) {
  return {
    name: t.name,
    proto: t.proto,
    publicUrl: t.public_url,
    addr: t.config?.addr ?? null,
    startedAt: t.started_at ?? null,
    requestCount: t.metrics?.http?.count ?? 0,
  };
}

function summarizeRequest(r) {
  return {
    id: r.id,
    tunnelName: r.tunnel_name,
    startedAt: r.start,
    durationMs: r.duration ? Math.round(r.duration / 1e6) : null,
    method: r.request?.method,
    uri: r.request?.uri,
    status: r.response?.status_code ?? null,
  };
}

module.exports = { NgrokAgent, AgentError, summarizeTunnel, summarizeRequest };
