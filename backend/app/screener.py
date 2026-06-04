"""Declarative screener engine + filterable field catalogue."""
from __future__ import annotations

from .models import FieldDef, Filter, Metrics, ScreenRequest

# The fields the UI can build filters on. Order = display order.
FIELDS: list[FieldDef] = [
    FieldDef(
        key="close", label="Price (LTP)", group="Price", unit="₹",
        desc="Last traded (closing) price of the scrip in rupees. "
        "Use it to keep results inside a price band — e.g. '≥ 100' to skip penny "
        "stocks, or 'between 100 and 2000' to match your position-sizing comfort.",
    ),
    FieldDef(
        key="change_pct", label="% Change (1D)", group="Price", unit="%",
        desc="Move versus the previous close, in percent. "
        "Use '> 2' to find today's gainers, '< -2' for losers, or "
        "'between -1 and 1' for quiet, range-bound names.",
    ),
    FieldDef(
        key="market_cap_cr", label="Market Cap", group="Price", unit="₹cr",
        desc="Total market value of the company in ₹ crore (price × shares). "
        "Use '> 20000' for large-caps, 'between 5000 and 20000' for mid-caps, "
        "'< 5000' for small-caps.",
    ),
    FieldDef(
        key="volume", label="Volume", group="Volume",
        desc="Number of shares traded in the session. A raw liquidity floor — "
        "use '> 100000' to drop illiquid scrips that are hard to enter or exit.",
    ),
    FieldDef(
        key="rel_volume", label="Relative Volume (x avg 20d)", group="Volume", unit="x",
        desc="Today's volume divided by its 20-day average. 1x = normal, 2x = twice "
        "the usual activity. Use '> 2' to catch unusual interest often tied to news "
        "or a breakout.",
    ),
    FieldDef(
        key="rsi_14", label="RSI (14)", group="Momentum",
        desc="Relative Strength Index (0–100) over 14 days — momentum gauge. "
        "Above 70 is traditionally overbought, below 30 oversold. "
        "Use 'between 55 and 70' for strong-but-not-stretched uptrends, or '< 30' "
        "to hunt oversold bounces.",
    ),
    FieldDef(
        key="macd_hist", label="MACD Histogram", group="Momentum",
        desc="MACD line minus its signal line (12/26/9 EMAs). Positive and rising = "
        "strengthening upside momentum; negative = downside. Use '> 0' for bullish "
        "momentum, '< 0' for bearish. The value is in the scrip's price units, so it "
        "scales with price — pair it with other filters rather than a fixed threshold.",
    ),
    FieldDef(
        key="pct_above_sma20", label="% vs SMA 20", group="Trend", unit="%",
        desc="How far price sits above (+) or below (−) its 20-day simple moving "
        "average — the short-term trend. Use '> 0' for names trading above their "
        "20DMA; large positive values may be short-term extended.",
    ),
    FieldDef(
        key="pct_above_sma50", label="% vs SMA 50", group="Trend", unit="%",
        desc="Distance from the 50-day moving average — the medium-term trend. "
        "Use '> 0' to keep names in a healthy intermediate uptrend.",
    ),
    FieldDef(
        key="pct_above_sma200", label="% vs SMA 200", group="Trend", unit="%",
        desc="Distance from the 200-day moving average — the long-term trend line "
        "most investors watch. Use '> 0' for stocks in a primary bull trend.",
    ),
    FieldDef(
        key="dist_52w_high_pct", label="% from 52w High", group="Range", unit="%",
        desc="Percent below the highest price of the last 52 weeks (0 = at a new high). "
        "Use 'between -5 and 0' to find breakout candidates near their highs.",
    ),
    FieldDef(
        key="dist_52w_low_pct", label="% from 52w Low", group="Range", unit="%",
        desc="Percent above the lowest price of the last 52 weeks. Small values mean "
        "near the lows. Use '> 50' for names well off their bottom, or a small value "
        "to scan beaten-down stocks.",
    ),
    FieldDef(
        key="atr_pct", label="ATR %", group="Volatility", unit="%",
        desc="Average True Range as a percent of price — typical daily swing. "
        "Use '> 4' for fast-moving, volatile scrips, or '< 2' for calmer ones that "
        "suit tighter stops.",
    ),
    # ---- Signals (Condition Catalog): 1 = the event happened today, else 0.
    # Filter with '= 1' (or '> 0') to keep only scrips where it triggered. ----
    FieldDef(key="golden_cross", label="Golden cross (50×200 up)", group="Signals",
             desc="1 if the 50-day SMA crossed ABOVE the 200-day today. Use '= 1'."),
    FieldDef(key="death_cross", label="Death cross (50×200 down)", group="Signals",
             desc="1 if the 50-day SMA crossed BELOW the 200-day today. Use '= 1'."),
    FieldDef(key="cross_20_50_up", label="20 SMA crossed above 50", group="Signals",
             desc="1 if the 20-day SMA crossed ABOVE the 50-day today. Use '= 1'."),
    FieldDef(key="cross_20_50_down", label="20 SMA crossed below 50", group="Signals",
             desc="1 if the 20-day SMA crossed BELOW the 50-day today. Use '= 1'."),
    FieldDef(key="new_high_52w", label="New 52-week high", group="Signals",
             desc="1 if today's high made a fresh 52-week high. Use '= 1'."),
    FieldDef(key="new_low_52w", label="New 52-week low", group="Signals",
             desc="1 if today's low made a fresh 52-week low. Use '= 1'."),
    FieldDef(key="macd_bull_cross", label="MACD bullish cross", group="Signals",
             desc="1 if the MACD histogram crossed above zero today. Use '= 1'."),
    FieldDef(key="macd_bear_cross", label="MACD bearish cross", group="Signals",
             desc="1 if the MACD histogram crossed below zero today. Use '= 1'."),
    FieldDef(key="gap_up", label="Gap up (>2%)", group="Signals",
             desc="1 if the open gapped up >2% over the previous close. Use '= 1'."),
    FieldDef(key="gap_down", label="Gap down (>2%)", group="Signals",
             desc="1 if the open gapped down >2% under the previous close. Use '= 1'."),
    FieldDef(key="volume_spike", label="Volume spike (≥2× avg)", group="Signals",
             desc="1 if today's volume is at least 2× the 20-day average. Use '= 1'."),
]

_FIELD_KEYS = {f.key for f in FIELDS}
# Also allow sorting/reading these descriptive fields.
_SORTABLE = _FIELD_KEYS | {"symbol", "name"}


def _passes(metric: Metrics, f: Filter) -> bool:
    if f.field not in _FIELD_KEYS:
        return True  # unknown field -> ignore rather than exclude everything
    v = getattr(metric, f.field)
    if v is None:
        # No value for this metric (e.g. market cap on a BSE-only scrip) can't
        # satisfy a numeric comparison — exclude it rather than crash.
        return False
    if f.op == "gt":
        return v > f.value
    if f.op == "gte":
        return v >= f.value
    if f.op == "lt":
        return v < f.value
    if f.op == "lte":
        return v <= f.value
    if f.op == "eq":
        return v == f.value
    if f.op == "between":
        hi = f.value2 if f.value2 is not None else f.value
        lo, hi = min(f.value, hi), max(f.value, hi)
        return lo <= v <= hi
    return True


def run_screen(metrics: list[Metrics], req: ScreenRequest) -> list[Metrics]:
    rows = metrics

    if req.exchange:
        rows = [m for m in rows if m.exchange == req.exchange]

    if req.segments:
        allowed = set(req.segments)
        # Unclassified rows default to EQ so they aren't silently dropped.
        rows = [m for m in rows if (m.segment or "EQ") in allowed]

    if req.query:
        q = req.query.strip().upper()
        rows = [m for m in rows if q in m.symbol.upper() or q in m.name.upper()]

    if req.filters:
        def keep(m: Metrics) -> bool:
            results = [_passes(m, f) for f in req.filters]
            return all(results) if req.logic == "AND" else any(results)
        rows = [m for m in rows if keep(m)]

    sort_key = req.sort_by if req.sort_by in _SORTABLE else "market_cap_cr"
    reverse = req.sort_dir == "desc"

    def sort_val(m: Metrics):
        # Sort missing values (None) last in BOTH directions: pair each value
        # with a "is-None" flag so Nones sink to the bottom regardless of order.
        v = getattr(m, sort_key)
        missing = v is None
        if missing:
            v = "" if isinstance(getattr(m, sort_key, None), str) else 0
        # When reverse=True, sorted() flips the whole tuple; XOR keeps None last.
        return (missing != reverse, v)

    rows = sorted(rows, key=sort_val, reverse=reverse)
    return rows[: max(1, req.limit)]
