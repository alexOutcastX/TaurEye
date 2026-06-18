"""Per-stock report generation for the published bundle.

Templated (rule-based) summaries built straight from the metrics row — ZERO LLM
cost, deterministic, no hallucination. Generated nightly by the exporter and
shipped as reports/<SYMBOL>.json so the app serves them instantly and for free;
the ai-report Edge Function stays as the on-demand fallback for non-cached
stocks. A model-backed generator (local Ollama / free API) can later overwrite
the top names with richer prose without changing the consumer contract.
"""
from __future__ import annotations

from datetime import datetime, timezone

DISCLAIMER = (
    "Automated, factual summary from end-of-day data — informational and educational only, "
    "not investment advice. Figures may be delayed or contain errors; verify against official "
    "exchange sources. TaurEye is not a SEBI-registered Investment Adviser or Research Analyst."
)


def _num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _f(x, dp=2) -> str:
    return f"{x:,.{dp}f}" if _num(x) else "—"


def _flag(m: dict, key: str) -> bool:
    return m.get(key) == 1


def build_report(m: dict) -> dict:
    """Return {symbol, name, generated_at, text(markdown), disclaimer} for one
    metrics row. Purely factual — no recommendations, no targets."""
    sym = m.get("symbol") or ""
    name = m.get("name") or sym
    parts = [f"## {name} ({sym}) — automated summary"]

    # ---- snapshot ----
    chg = m.get("change_pct")
    snap = f"Last close **₹{_f(m.get('close'))}**"
    if _num(chg):
        snap += f" ({'+' if chg >= 0 else ''}{_f(chg)}% on the day)"
    cap = m.get("market_cap_cr")
    if _num(cap) and cap > 0:
        snap += f", market cap ~₹{_f(cap, 0)} cr"
    sec = m.get("sector")
    if sec and sec != "Unknown":
        snap += f", sector {sec}"
    parts.append("**Snapshot.** " + snap + ".")

    # ---- trend ----
    rel = lambda p: "above" if _num(p) and p >= 0 else "below"
    trend = (f"Price is {rel(m.get('pct_above_sma20'))} the 20-DMA, "
             f"{rel(m.get('pct_above_sma50'))} the 50-DMA and "
             f"{rel(m.get('pct_above_sma200'))} the 200-DMA")
    if _flag(m, "golden_cross"):
        trend += " — a 50/200 golden cross is in effect"
    elif _flag(m, "death_cross"):
        trend += " — a 50/200 death cross is in effect"
    parts.append("**Trend.** " + trend + ".")

    # ---- momentum ----
    rsi = m.get("rsi_14")
    mom = ""
    if _num(rsi):
        zone = "oversold (<30)" if rsi < 30 else "overbought (>70)" if rsi > 70 else "neutral"
        mom += f"RSI(14) is {_f(rsi, 0)} ({zone} zone). "
    mh = m.get("macd_hist")
    if _num(mh):
        mom += f"MACD histogram is {'positive' if mh >= 0 else 'negative'}"
        if _flag(m, "macd_bull_cross"):
            mom += ", with a recent bullish crossover"
        elif _flag(m, "macd_bear_cross"):
            mom += ", with a recent bearish crossover"
        mom += "."
    if mom:
        parts.append("**Momentum.** " + mom.strip())

    # ---- 52-week range ----
    dh, dl = m.get("dist_52w_high_pct"), m.get("dist_52w_low_pct")
    fw = ""
    if _flag(m, "new_high_52w"):
        fw = "At a new 52-week high."
    elif _flag(m, "new_low_52w"):
        fw = "At a new 52-week low."
    elif _num(dh):
        fw = f"{_f(abs(dh))}% from its 52-week high"
        if _num(dl):
            fw += f", {_f(abs(dl))}% above its 52-week low"
        fw += "."
    if fw:
        parts.append("**52-week range.** " + fw)

    # ---- volume & volatility ----
    rv, atr = m.get("rel_volume"), m.get("atr_pct")
    vv = ""
    if _num(rv):
        vv += f"Relative volume {_f(rv)}×"
        vv += " — volume spike flagged. " if _flag(m, "volume_spike") else ". "
    if _num(atr):
        vv += f"ATR {_f(atr)}% (daily volatility). "
    if _flag(m, "gap_up"):
        vv += "Gapped up today. "
    elif _flag(m, "gap_down"):
        vv += "Gapped down today. "
    if vv:
        parts.append("**Volume & volatility.** " + vv.strip())

    return {
        "symbol": sym,
        "name": name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "text": "\n\n".join(parts),
        "disclaimer": DISCLAIMER,
    }
