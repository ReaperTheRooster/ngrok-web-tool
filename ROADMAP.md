# Roadmap

## Done
- Flask dashboard: start/stop tunnels, list public URLs
- Webhook inspector (`/hook/*`) with live view
- Public tunnel traffic restricted to `/hook/*`
- Tests with fake backend, GitHub Actions CI

## Next
1. Add optional basic auth for the dashboard
2. Replay a captured request to a local port
3. Pretty-print JSON bodies; filter/search the request list
4. Persist the request log (SQLite)
5. Show tunnel traffic stats
