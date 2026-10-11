# ngrok-web-tool

A local web dashboard (Python/Flask) for starting and stopping ngrok tunnels, seeing their public URLs, and inspecting incoming webhook requests. Uses the official [ngrok Python SDK](https://pypi.org/project/ngrok/).

**Authorized use only:** only expose services you own or have permission to expose. A public tunnel makes a local port reachable from the internet.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then add your NGROK_AUTHTOKEN
python -m ngrok_dashboard
```

Open http://127.0.0.1:5000. The dashboard binds to localhost only, since it can open tunnels.

## Usage

- **Tunnels:** enter a local port and click *Start tunnel*. The public URL is listed; click *Stop* to close it.
- **Inspector:** any request to `/hook/<anything>` is logged (method, path, query, headers, body) and shown live. Start a tunnel to the dashboard's own port (default 5000) to receive real webhooks.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Tests use a fake ngrok backend, so no token or network is needed.

## Security notes

- The authtoken comes from the `NGROK_AUTHTOKEN` environment variable (or a git-ignored `.env`). Never commit it.
- The inspector keeps the last 200 requests in memory only and caps bodies at 1 MB.
- Requests that arrive through a tunnel (they carry `X-Forwarded-For`) can only reach `/hook/*`; the dashboard UI and `/api` return 403, so tunnelling the dashboard's own port is safe for receiving webhooks.

## License

MIT
