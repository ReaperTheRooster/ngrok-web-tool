'use strict';

const { loadConfig } = require('./lib/config');
const { NgrokAgent } = require('./lib/ngrok');
const { createApp } = require('./lib/app');

const config = loadConfig();
const agent = new NgrokAgent({ baseUrl: config.agentUrl, timeoutMs: config.agentTimeoutMs });
const server = createApp({ agent });

server.listen(config.port, config.host, () => {
  console.log(`ngrok-web-tool listening on http://${config.host}:${config.port}`);
  console.log(`Using ngrok agent at ${config.agentUrl}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
