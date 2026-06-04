"""TaurEye backend API (Phase 1).

This module also defines the OpenAPI / Swagger documentation that powers the
interactive docs at ``/docs`` (Swagger UI) and ``/redoc`` (ReDoc). The raw
machine-readable spec is served at ``/openapi.json``.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from .models import (
    Candle,
    FieldDef,
    Metrics,
    SavedScreen,
    SaveScreenRequest,
    ScreenRequest,
    ScreenResponse,
    Security,
)
from .screener import FIELDS, run_screen
from .store import get_store

API_DESCRIPTION = """
**TaurEye API** serves the Indian-equity screener, charts, and reference data
that power the TaurEye web and mobile apps.

All data is **factual market information only** — prices, technical indicators,
and market caps computed from end-of-day (EOD) data. Nothing here is investment
advice, and TaurEye is not a SEBI-registered Investment Adviser or Research
Analyst.

### Data freshness
Endpoints back onto an EOD price spine. The most recent trading date is reported
by `GET /api/indices` (`data_date`) and the universe size by `GET /api/health`.

### Trying it out
Use the **Try it out** button on any endpoint below. Request bodies (e.g.
`POST /api/screen`) come pre-filled with a working example you can edit and run.

### Authentication
Auth is **optional** and off by default for local/LAN use. If the server sets
the `TAUREYE_API_KEY` environment variable (e.g. on a public host), every
`/api/*` call except `/api/health` must present the key via the `X-API-Key`
header or a `?key=` query parameter. See the **ApiKeyHeader** scheme below.
""".strip()

TAGS_METADATA = [
    {"name": "System", "description": "Service status and liveness checks."},
    {"name": "Market Data", "description": "Index levels and screener reference data (fields, segments)."},
    {"name": "Securities", "description": "Per-scrip lookup: search, latest metrics, and price history."},
    {"name": "Screener", "description": "Run filter/sort queries across the whole universe."},
    {"name": "Saved Screens", "description": "Persist, list, and delete named screen definitions."},
    {"name": "AI", "description": "Educational, factual AI summaries (when an LLM key is configured)."},
]

app = FastAPI(
    title="TaurEye API",
    version="1.0.0",
    description=API_DESCRIPTION,
    terms_of_service="https://taureye.app/terms",
    contact={"name": "TaurEye", "url": "https://taureye.app"},
    license_info={"name": "Proprietary"},
    openapi_tags=TAGS_METADATA,
    servers=[
        {"url": "http://localhost:8010", "description": "Local dev (via this machine)"},
        {"url": "http://{lan_ip}:8010", "description": "LAN — replace {lan_ip} with your PC's IP for device testing",
         "variables": {"lan_ip": {"default": "192.168.1.20"}}},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _api_key_guard(request, call_next):
    """Optional API key. If TAUREYE_API_KEY is set (e.g. on a public host), every
    /api/* call must present it via the X-API-Key header or ?key= query param.
    Left unset for local/LAN use, so nothing changes for development. /api/health
    stays open so uptime checks work, and CORS preflight (OPTIONS) is allowed."""
    import os

    from starlette.responses import JSONResponse

    key = os.getenv("TAUREYE_API_KEY")
    path = request.url.path
    if (
        key
        and path.startswith("/api/")
        and path != "/api/health"
        and request.method != "OPTIONS"
    ):
        supplied = request.headers.get("x-api-key") or request.query_params.get("key")
        if supplied != key:
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.on_event("startup")
def _warm() -> None:
    # Building the metrics snapshot for the whole universe takes many seconds.
    # Doing it *inside* the startup event blocks uvicorn from binding its socket,
    # so the dev proxy answers every request with 502 until it finishes. Instead
    # warm the store on a background thread: the socket binds immediately, static
    # endpoints (/api/fields) answer at once, and the first /api/screen simply
    # waits on get_store()'s lock (a slow 200) rather than failing with a 502.
    import threading

    threading.Thread(target=get_store, name="store-warmup", daemon=True).start()


@app.get(
    "/",
    tags=["System"],
    summary="Service banner",
    description="Friendly JSON banner shown when the API port is opened directly. Points to the docs.",
    responses={200: {"content": {"application/json": {"example": {
        "service": "TaurEye API", "status": "ok",
        "hint": "This is the backend API. Open the app at http://localhost:5174",
        "docs": "/docs"}}}}},
)
def root() -> dict:
    # Friendly message if someone opens the API port directly.
    return {
        "service": "TaurEye API",
        "status": "ok",
        "hint": "This is the backend API. Open the app at http://localhost:5174",
        "docs": "/docs",
    }


@app.get(
    "/api/health",
    tags=["System"],
    summary="Health check",
    description="Liveness probe. Reports the loaded universe size and the active data provider "
    "(`db` = real EOD data, `synthetic` = generated demo data). Always reachable, even when an API key is set.",
    responses={200: {"content": {"application/json": {"example": {
        "status": "ok", "universe": 5833, "provider": "db"}}}}},
)
def health() -> dict:
    import os

    store = get_store()
    return {
        "status": "ok",
        "universe": len(store.securities),
        "provider": os.getenv("TAUREYE_PROVIDER", "synthetic").lower(),
    }


@app.get(
    "/api/fields",
    response_model=list[FieldDef],
    tags=["Market Data"],
    summary="Screenable fields",
    description="The catalog of numeric metrics that can be filtered/sorted in the screener, "
    "with display labels, units, groups, and descriptions. Use a field's `key` in `Filter.field` and `sort_by`.",
)
def fields() -> list[FieldDef]:
    return FIELDS


def _latest_data_date() -> str | None:
    """Most recent trading date in the spine — the 'prices as of' timestamp."""
    try:
        from .dataengine.db import connect
        with connect() as conn:
            row = conn.execute("SELECT MAX(date) d FROM prices").fetchone()
            return row["d"] if row else None
    except Exception:
        return None


@app.get(
    "/api/indices",
    tags=["Market Data"],
    summary="Market indices + data date",
    description="Live index ticker (NIFTY, BANK NIFTY, SENSEX, INDIA VIX, USD/INR) plus the EOD "
    "`data_date` the prices belong to. Factual levels only — informational, not advice.",
    responses={200: {"content": {"application/json": {"example": {
        "indices": [
            {"key": "NIFTY", "label": "NIFTY", "value": 23414.6, "change_pct": 0.04},
            {"key": "BANKNIFTY", "label": "BANK NIFTY", "value": 54229.7, "change_pct": 0.08},
            {"key": "INDIAVIX", "label": "INDIA VIX", "value": 16.06, "change_pct": -1.36},
            {"key": "USDINR", "label": "USD/INR", "value": 95.79, "change_pct": None},
        ],
        "as_of": "2026-06-04T08:33:25.670268+00:00",
        "data_date": "2026-05-29"}}}}},
)
def indices() -> dict:
    """Live index ticker (NIFTY, BANK NIFTY, SENSEX, INDIA VIX, USD/INR) plus the
    EOD data date. Factual levels only — informational, not advice."""
    from . import indices as idx
    data = idx.get_indices()
    return {**data, "data_date": _latest_data_date()}


@app.get(
    "/api/segments",
    tags=["Market Data"],
    summary="Instrument segments",
    description="Available instrument segments with live counts (EQ/ETF/SME), for the screener's "
    "include/exclude control. Computed from the current snapshot.",
    responses={200: {"content": {"application/json": {"example": [
        {"key": "EQ", "label": "Equity", "count": 5200},
        {"key": "ETF", "label": "ETF", "count": 410},
        {"key": "SME", "label": "SME", "count": 223}]}}}},
)
def segments() -> list[dict]:
    """Available instrument segments with counts, for the screener's include/
    exclude control. Computed from the live snapshot so it reflects real data."""
    from collections import Counter

    _LABELS = {"EQ": "Equity", "ETF": "ETF", "SME": "SME"}
    c = Counter((m.segment or "EQ") for m in get_store().all_metrics())
    return [
        {"key": k, "label": _LABELS.get(k, k), "count": c[k]}
        for k in sorted(c, key=lambda k: -c[k])
    ]


@app.get(
    "/api/securities",
    response_model=list[Security],
    tags=["Securities"],
    summary="Search securities",
    description="Search the universe by symbol or company name. Powers the scrip search box. "
    "Case-insensitive substring match; optionally restrict by exchange.",
)
def securities(
    q: str | None = Query(default=None, description="Search text matched against symbol and name.", examples=["reliance"]),
    exchange: str | None = Query(default=None, description="Restrict to one exchange: NSE or BSE.", examples=["NSE"]),
    limit: int = Query(default=50, ge=1, le=500, description="Maximum rows to return."),
) -> list[Security]:
    rows = get_store().securities
    if exchange:
        rows = [s for s in rows if s.exchange == exchange.upper()]
    if q:
        qq = q.strip().upper()
        rows = [s for s in rows if qq in s.symbol.upper() or qq in s.name.upper()]
    return rows[:limit]


@app.post(
    "/api/screen",
    response_model=ScreenResponse,
    tags=["Screener"],
    summary="Run a screen",
    description="Run a filter/sort query across the entire universe and return the matching rows "
    "(capped at `limit`), the match `count`, and the `total_universe` scanned. Rows with a missing "
    "value for the sort field always sink to the bottom.",
)
def screen(req: ScreenRequest) -> ScreenResponse:
    store = get_store()
    metrics = store.all_metrics()
    results = run_screen(metrics, req)
    return ScreenResponse(
        count=len(results),
        total_universe=len(metrics),
        results=results,
    )


@app.get(
    "/api/ai/analysis/{symbol}",
    tags=["AI"],
    summary="AI analysis (educational)",
    description="Educational AI summary of a scrip's factual indicators. Returns `configured=false` "
    "when no LLM key is set on the server. Always includes a disclaimer; never advice.",
    responses={
        200: {"content": {"application/json": {"example": {
            "configured": False, "text": None,
            "error": "AI analysis needs an online connection.",
            "disclaimer": "Educational only — not investment advice. TaurEye is not a SEBI-registered "
                          "Investment Adviser or Research Analyst."}}}},
        404: {"description": "Unknown symbol"},
    },
)
def ai_analysis(
    symbol: str = Path(description="Ticker symbol, e.g. RELIANCE.", examples=["RELIANCE"]),
) -> dict:
    """Educational AI summary of a scrip's factual indicators. Returns
    configured=False when no LLM key is set on the server."""
    store = get_store()
    m = store.metrics.get(symbol)
    if not m:
        raise HTTPException(status_code=404, detail="Unknown symbol")
    from . import ai

    res = ai.analyze(m)
    res["disclaimer"] = (
        "Educational only — not investment advice. TaurEye is not a SEBI-registered "
        "Investment Adviser or Research Analyst."
    )
    return res


@app.get(
    "/api/metrics/{symbol}",
    response_model=Metrics,
    tags=["Securities"],
    summary="Latest metrics for one scrip",
    description="Latest factual snapshot for one scrip — powers the stock info panel. Objective "
    "market data only (price, technical indicators, market cap, signal flags); no advice.",
    responses={404: {"description": "Unknown symbol"}},
)
def metrics_one(
    symbol: str = Path(description="Ticker symbol, e.g. RELIANCE.", examples=["RELIANCE"]),
) -> Metrics:
    """Latest factual snapshot for one scrip — powers the stock info panel.
    Objective market data only (price, indicators, market cap); no advice."""
    store = get_store()
    m = store.metrics.get(symbol)
    if not m:
        raise HTTPException(status_code=404, detail="Unknown symbol")
    return m


@app.get(
    "/api/candles/{symbol}",
    response_model=list[Candle],
    tags=["Securities"],
    summary="Price history (OHLCV)",
    description="Daily OHLCV candles for one scrip, oldest→newest, returning the last `limit` rows. "
    "Powers the chart. Prices are split/bonus-adjusted.",
    responses={404: {"description": "Unknown symbol"}},
)
def candles(
    symbol: str = Path(description="Ticker symbol, e.g. RELIANCE.", examples=["RELIANCE"]),
    limit: int = Query(default=260, ge=1, le=10000, description="How many most-recent daily candles to return."),
) -> list[Candle]:
    store = get_store()
    if symbol not in store.metrics:
        raise HTTPException(status_code=404, detail="Unknown symbol")
    rows = store.candles(symbol)
    return rows[-limit:]


@app.get(
    "/api/screens",
    response_model=list[SavedScreen],
    tags=["Saved Screens"],
    summary="List saved screens",
    description="Return all saved screen definitions on the server, newest first.",
)
def list_screens() -> list[SavedScreen]:
    return get_store().load_saved()


@app.post(
    "/api/screens",
    response_model=SavedScreen,
    tags=["Saved Screens"],
    summary="Save a screen",
    description="Persist a named screen definition and return it with a server-assigned id and timestamp.",
)
def create_screen(req: SaveScreenRequest) -> SavedScreen:
    return get_store().save_screen(req)


@app.delete(
    "/api/screens/{screen_id}",
    tags=["Saved Screens"],
    summary="Delete a saved screen",
    description="Delete a saved screen by id. Returns the deleted id, or 404 if it does not exist.",
    responses={
        200: {"content": {"application/json": {"example": {"deleted": "scr_a1b2c3"}}}},
        404: {"description": "Screen not found"},
    },
)
def delete_screen(
    screen_id: str = Path(description="Id returned when the screen was saved."),
) -> dict:
    ok = get_store().delete_screen(screen_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Screen not found")
    return {"deleted": screen_id}


def _custom_openapi() -> dict:
    """Augment the auto-generated schema with the optional API-key security
    scheme so it shows up (and is usable via 'Authorize') in Swagger UI."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        terms_of_service=app.terms_of_service,
        contact=app.contact,
        license_info=app.license_info,
        tags=app.openapi_tags,
        servers=app.servers,
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["ApiKeyHeader"] = {
        "type": "apiKey", "in": "header", "name": "X-API-Key",
        "description": "Required only when the server sets TAUREYE_API_KEY. Off for local/LAN use.",
    }
    schema["components"]["securitySchemes"]["ApiKeyQuery"] = {
        "type": "apiKey", "in": "query", "name": "key",
        "description": "Alternative to the X-API-Key header (e.g. ?key=...).",
    }
    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi  # type: ignore[assignment]
