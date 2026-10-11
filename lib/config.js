'use strict';

// Runtime configuration, read from environment variables with safe defaults.
// The dashboard controls tunnels, so it binds to loopback unless told otherwise.
function loadConfig(env = process.env) {
  const port = Number.parseInt(env.PORT || '3000', 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return {
    host: env.HOST || '127.0.0.1',
    port,
    agentUrl: (env.NGROK_AGENT_URL || 'http://127.0.0.1:4040').replace(/\/+$/, ''),
    agentTimeoutMs: Number.parseInt(env.NGROK_AGENT_TIMEOUT_MS || '5000', 10),
  };
}

module.exports = { loadConfig };
