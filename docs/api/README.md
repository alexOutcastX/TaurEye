# TaurEye API — Swagger / OpenAPI documentation

Interactive, testable documentation for the TaurEye backend API.

## How to view

**Option A — share with the team (no server needed)**
Open **`index.html`** in any browser (double-click works). It's a self-contained
Swagger UI — the spec is embedded and the UI assets are vendored in
`swagger-ui/`, so it renders with no internet at all. The endpoints'
**Try it out** buttons need a running backend to actually call (see Option B).

**Option B — live, against a running backend**
Start the API (`taureye` → run, or `npm start`), then open:

| URL | What |
|-----|------|
| http://localhost:8010/docs | Swagger UI (interactive, "Try it out" works) |
| http://localhost:8010/redoc | ReDoc (clean reference layout) |
| http://localhost:8010/openapi.json | Raw OpenAPI 3.1 spec (machine-readable) |

The live `/docs` is generated from the code, so it's always in sync. The files
in this folder are an exported snapshot for offline sharing.

## Files

- `openapi.json` — the OpenAPI 3.1 spec (import into Postman, Insomnia, code
  generators, etc.).
- `index.html` — standalone Swagger UI viewer (spec embedded).
- `swagger-ui/` — vendored Swagger UI assets (`swagger-ui.css`,
  `swagger-ui-bundle.js`) so `index.html` works with **zero internet** — no CDN.
- `README.md` — this file.

## Regenerating the snapshot

After changing endpoints, re-export from the project root:

```bash
# 1. spec
.venv/Scripts/python.exe -c "import json; from backend.app.main import app; json.dump(app.openapi(), open('docs/api/openapi.json','w'), indent=2)"
# 2. embed into index.html  (re-run the build snippet used to create it)
```

Or just rely on the live `/docs` endpoint, which never goes stale.

## Endpoints at a glance

| Method | Path | Tag | Summary |
|--------|------|-----|---------|
| GET  | `/` | System | Service banner |
| GET  | `/api/health` | System | Health check (universe size, provider) |
| GET  | `/api/fields` | Market Data | Screenable fields catalog |
| GET  | `/api/indices` | Market Data | Index levels + EOD data date |
| GET  | `/api/segments` | Market Data | Instrument segments with counts |
| GET  | `/api/securities` | Securities | Search by symbol/name |
| GET  | `/api/metrics/{symbol}` | Securities | Latest metrics for one scrip |
| GET  | `/api/candles/{symbol}` | Securities | Daily OHLCV history |
| POST | `/api/screen` | Screener | Run a filter/sort query |
| GET  | `/api/screens` | Saved Screens | List saved screens |
| POST | `/api/screens` | Saved Screens | Save a screen |
| DELETE | `/api/screens/{screen_id}` | Saved Screens | Delete a saved screen |
| GET  | `/api/ai/analysis/{symbol}` | AI | Educational AI summary |

## Authentication

Auth is **optional** and off by default. If the server sets the
`TAUREYE_API_KEY` environment variable, every `/api/*` call except
`/api/health` must send the key via the `X-API-Key` header or a `?key=` query
parameter. Both schemes are documented in the spec (`ApiKeyHeader`,
`ApiKeyQuery`) and usable via the **Authorize** button in Swagger UI.

> Data is factual market information only — not investment advice.
