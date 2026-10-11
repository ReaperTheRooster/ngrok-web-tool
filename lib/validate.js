'use strict';

const PROTOS = new Set(['http', 'tcp', 'tls']);
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

// An address is either a port number ("8080") or host:port ("localhost:8080").
function normalizeAddr(addr) {
  const value = String(addr ?? '').trim();
  if (/^\d+$/.test(value)) {
    const port = Number(value);
    if (port < 1 || port > 65535) throw new ValidationError('Port must be 1-65535');
    return value;
  }
  const m = /^([A-Za-z0-9.-]+):(\d{1,5})$/.exec(value);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 65535) {
    throw new ValidationError('addr must be a port or host:port');
  }
  return value;
}

function validateTunnelName(name) {
  if (!NAME_RE.test(String(name ?? ''))) {
    throw new ValidationError('Tunnel name must be 1-64 chars: letters, digits, "_", ".", "-"');
  }
  return String(name);
}

function validateId(id, label = 'id') {
  if (!ID_RE.test(String(id ?? ''))) throw new ValidationError(`Invalid ${label}`);
  return String(id);
}

// Validate and whitelist the fields accepted when starting a tunnel.
function validateTunnelInput(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('JSON body required');
  const proto = String(body.proto ?? 'http').toLowerCase();
  if (!PROTOS.has(proto)) throw new ValidationError(`proto must be one of: ${[...PROTOS].join(', ')}`);
  const out = {
    name: validateTunnelName(body.name),
    proto,
    addr: normalizeAddr(body.addr),
  };
  if (body.domain) {
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(String(body.domain))) throw new ValidationError('Invalid domain');
    out.domain = String(body.domain);
  }
  return out;
}

function parseLimit(value, fallback = 50, max = 200) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) throw new ValidationError('limit must be a positive integer');
  return Math.min(n, max);
}

module.exports = {
  ValidationError,
  normalizeAddr,
  validateTunnelName,
  validateId,
  validateTunnelInput,
  parseLimit,
};
