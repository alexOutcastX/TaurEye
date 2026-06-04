"""AI stock analysis — educational, SEBI-safe summaries of factual indicators.

Calls an OpenAI-compatible chat endpoint (configurable, so it works with OpenAI,
OpenRouter, a local server, etc.) using env vars:
  TAUREYE_AI_KEY    - API key (REQUIRED to enable; absent = feature disabled)
  TAUREYE_AI_BASE   - base URL (default https://api.openai.com/v1)
  TAUREYE_AI_MODEL  - model name (default gpt-4o-mini)

The prompt is strictly educational: it explains what the data shows and what the
indicators mean. It must not give recommendations, targets, or predictions.
"""
from __future__ import annotations

import os

from .models import Metrics

SYSTEM_PROMPT = (
    "You are a market-data explainer for an Indian (NSE/BSE) stock screener. "
    "Given a stock's factual end-of-day technical indicators, explain in plain, "
    "neutral language what the data shows and what each indicator means, for "
    "educational purposes only. Strict rules: do NOT give buy/sell/hold "
    "recommendations, price targets, or predictions; do NOT advise what the user "
    "should do; only describe the present technical picture. Keep it to 4-6 short "
    "sentences, no preamble."
)


def is_enabled() -> bool:
    return bool(os.getenv("TAUREYE_AI_KEY"))


def _facts(m: Metrics) -> str:
    parts = [
        f"{m.symbol} ({m.exchange}). LTP Rs {m.close}, {m.change_pct}% today.",
        f"RSI(14) {m.rsi_14}. Price vs SMA20 {m.pct_above_sma20}%, "
        f"SMA50 {m.pct_above_sma50}%, SMA200 {m.pct_above_sma200}%.",
        f"From 52-week high {m.dist_52w_high_pct}%, from 52-week low "
        f"{m.dist_52w_low_pct}%. ATR {m.atr_pct}%. Relative volume {m.rel_volume}x.",
    ]
    if m.market_cap_cr:
        parts.append(f"Market cap Rs {m.market_cap_cr} crore.")
    sig = []
    flags = {
        "golden_cross": "50/200 golden cross today",
        "death_cross": "50/200 death cross today",
        "cross_20_50_up": "20-DMA crossed above 50-DMA today",
        "cross_20_50_down": "20-DMA crossed below 50-DMA today",
        "new_high_52w": "new 52-week high today",
        "new_low_52w": "new 52-week low today",
        "macd_bull_cross": "MACD bullish cross today",
        "macd_bear_cross": "MACD bearish cross today",
        "gap_up": "gapped up >2%",
        "gap_down": "gapped down >2%",
        "volume_spike": "volume >= 2x average",
    }
    for k, label in flags.items():
        if getattr(m, k, 0):
            sig.append(label)
    if sig:
        parts.append("Signals: " + "; ".join(sig) + ".")
    return " ".join(parts)


def analyze(m: Metrics) -> dict:
    """Return {configured, text, error?}. configured=False when no key is set."""
    if not is_enabled():
        return {"configured": False, "text": None}

    import requests

    base = os.getenv("TAUREYE_AI_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("TAUREYE_AI_MODEL", "gpt-4o-mini")
    key = os.getenv("TAUREYE_AI_KEY")
    try:
        resp = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.3,
                "max_tokens": 350,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _facts(m)},
                ],
            },
            timeout=30,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"].strip()
        return {"configured": True, "text": text}
    except Exception as e:  # network / API / shape errors → graceful
        return {"configured": True, "text": None, "error": str(e)[:200]}
