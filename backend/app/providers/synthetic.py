"""Synthetic NSE/BSE provider.

Generates a realistic-looking universe of Indian scrips plus ~2 years of
daily EOD candles using a seeded random walk. Deterministic per-symbol so
results are stable across restarts. Replace with the DHAN provider later.
"""
from __future__ import annotations

import hashlib
import math
import random
from datetime import date, timedelta
from functools import lru_cache

from ..models import Candle, Security
from .base import MarketDataProvider

# A spread of real large/mid-cap names so the screener feels familiar.
_SEED_NAMES: list[tuple[str, str, str]] = [
    ("RELIANCE", "Reliance Industries", "Energy"),
    ("TCS", "Tata Consultancy Services", "IT"),
    ("HDFCBANK", "HDFC Bank", "Banking"),
    ("INFY", "Infosys", "IT"),
    ("ICICIBANK", "ICICI Bank", "Banking"),
    ("HINDUNILVR", "Hindustan Unilever", "FMCG"),
    ("ITC", "ITC", "FMCG"),
    ("SBIN", "State Bank of India", "Banking"),
    ("BHARTIARTL", "Bharti Airtel", "Telecom"),
    ("KOTAKBANK", "Kotak Mahindra Bank", "Banking"),
    ("LT", "Larsen & Toubro", "Infrastructure"),
    ("AXISBANK", "Axis Bank", "Banking"),
    ("ASIANPAINT", "Asian Paints", "Materials"),
    ("MARUTI", "Maruti Suzuki", "Auto"),
    ("SUNPHARMA", "Sun Pharmaceutical", "Pharma"),
    ("TITAN", "Titan Company", "Consumer"),
    ("ULTRACEMCO", "UltraTech Cement", "Materials"),
    ("WIPRO", "Wipro", "IT"),
    ("NESTLEIND", "Nestle India", "FMCG"),
    ("TATAMOTORS", "Tata Motors", "Auto"),
    ("POWERGRID", "Power Grid Corp", "Utilities"),
    ("NTPC", "NTPC", "Utilities"),
    ("HCLTECH", "HCL Technologies", "IT"),
    ("BAJFINANCE", "Bajaj Finance", "Financials"),
    ("ADANIENT", "Adani Enterprises", "Conglomerate"),
    ("ONGC", "Oil & Natural Gas Corp", "Energy"),
    ("TATASTEEL", "Tata Steel", "Metals"),
    ("JSWSTEEL", "JSW Steel", "Metals"),
    ("COALINDIA", "Coal India", "Energy"),
    ("GRASIM", "Grasim Industries", "Materials"),
    ("DRREDDY", "Dr Reddy's Labs", "Pharma"),
    ("CIPLA", "Cipla", "Pharma"),
    ("EICHERMOT", "Eicher Motors", "Auto"),
    ("BPCL", "Bharat Petroleum", "Energy"),
    ("BRITANNIA", "Britannia Industries", "FMCG"),
    ("DIVISLAB", "Divi's Laboratories", "Pharma"),
    ("HEROMOTOCO", "Hero MotoCorp", "Auto"),
    ("INDUSINDBK", "IndusInd Bank", "Banking"),
    ("M&M", "Mahindra & Mahindra", "Auto"),
    ("TECHM", "Tech Mahindra", "IT"),
]

_SECTORS = sorted({s for _, _, s in _SEED_NAMES})
_PREFIXES = ["ARYA", "BHEL", "CIGN", "DELTA", "ESKA", "FINO", "GANE", "HARI",
             "INDO", "JYOT", "KALP", "LUMI", "MEGA", "NOVA", "ORBI", "PRIM",
             "QUBE", "RADI", "SUMI", "TERA", "UMA", "VIBR", "WELL", "XENO",
             "YASH", "ZENI"]


class SyntheticProvider(MarketDataProvider):
    def __init__(self, universe_size: int = 320, days: int = 520) -> None:
        self.universe_size = universe_size
        self.days = days
        self._securities = self._build_universe()

    # ---- universe ----
    def _build_universe(self) -> list[Security]:
        out: list[Security] = []
        for sym, name, sector in _SEED_NAMES:
            out.append(self._mk_security(sym, name, sector, "NSE"))

        rng = random.Random(42)
        i = 0
        while len(out) < self.universe_size:
            pref = _PREFIXES[i % len(_PREFIXES)]
            suffix = i // len(_PREFIXES)
            sym = pref if suffix == 0 else f"{pref}{suffix}"
            sector = rng.choice(_SECTORS)
            exch = "BSE" if i % 3 == 0 else "NSE"
            name = f"{pref.title()} {rng.choice(['Industries', 'Ltd', 'Corp', 'Finance', 'Tech', 'Motors', 'Power'])}"
            out.append(self._mk_security(sym, name, sector, exch))
            i += 1
        return out

    @staticmethod
    def _mk_security(symbol: str, name: str, sector: str, exchange: str) -> Security:
        h = hashlib.md5(symbol.encode()).hexdigest()[:6].upper()
        # Deterministic fake share count (10cr–500cr) so synthetic mode still
        # produces a plausible market cap. Real caps come from the DB provider's
        # NSE issuedSize enrichment, not this.
        shares = float((int(h, 16) % 490_000_000) + 100_000_000)
        return Security(
            symbol=symbol,
            name=name,
            exchange=exchange,  # type: ignore[arg-type]
            sector=sector,
            isin=f"INE{h}01010",
            shares_outstanding=shares,
            segment="EQ",
        )

    def securities(self) -> list[Security]:
        return list(self._securities)

    # ---- history ----
    def history(self, symbol: str) -> list[Candle]:
        return _history(symbol, self.days)


def _seed(symbol: str) -> int:
    return int(hashlib.md5(symbol.encode()).hexdigest(), 16) % (2**32)


@lru_cache(maxsize=4096)
def _history(symbol: str, days: int) -> tuple[Candle, ...]:
    rng = random.Random(_seed(symbol))
    # Per-symbol character.
    price = rng.uniform(40, 3800)
    drift = rng.uniform(-0.0006, 0.0011)          # daily mean return
    vol = rng.uniform(0.012, 0.035)               # daily volatility
    base_volume = rng.randint(80_000, 9_000_000)

    candles: list[Candle] = []
    today = date(2026, 5, 29)
    start = today - timedelta(days=int(days * 1.45))  # pad for weekends
    d = start
    count = 0
    while count < days:
        if d.weekday() < 5:  # Mon-Fri only
            shock = rng.gauss(drift, vol)
            o = price
            c = max(1.0, o * (1 + shock))
            hi = max(o, c) * (1 + abs(rng.gauss(0, vol / 2)))
            lo = min(o, c) * (1 - abs(rng.gauss(0, vol / 2)))
            vmult = 1 + abs(rng.gauss(0, 0.6))
            volume = int(base_volume * vmult)
            candles.append(Candle(
                date=d.isoformat(),
                open=round(o, 2),
                high=round(hi, 2),
                low=round(lo, 2),
                close=round(c, 2),
                volume=volume,
            ))
            price = c
            count += 1
        d += timedelta(days=1)
    return tuple(candles)
