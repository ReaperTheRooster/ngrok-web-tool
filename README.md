# ngrok-web-tool

A small, dependency-free web dashboard for the local [ngrok agent API](https://ngrok.com/docs/agent/api/).
Start and stop tunnels, watch captured HTTP requests, and replay them from the browser.

## Run

```sh
ngrok start --none      # or any ngrok agent exposing the API on :4040
npm start               # http://127.0.0.1:3000
npm test
```

Requires Node 18+. No npm dependencies.

| Env var | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address (keep on loopback; the API can open tunnels) |
| `PORT` | `3000` | Dashboard port |
| `NGROK_AGENT_URL` | `http://127.0.0.1:4040` | ngrok agent API base URL |
| `NGROK_AGENT_TIMEOUT_MS` | `5000` | Agent request timeout |

## Layout

- `lib/ngrok.js` – agent API client
- `lib/validate.js` – input validation/whitelisting
- `lib/app.js` – HTTP routes, static serving, same-origin guard
- `public/` – vanilla JS dashboard
- `test/` – `node:test` suites using a fake agent

## Roadmap (about 500-1000 lines per day)

- [x] Day 1: tunnel start/stop, request list/detail/replay, validation, tests
- [ ] Request detail view with headers/body formatting and filtering
- [ ] Saved tunnel presets (JSON file)
- [ ] Optional auth token for the dashboard
- [ ] Live updates (SSE) instead of polling
