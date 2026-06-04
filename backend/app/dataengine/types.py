"""Normalized rows the source adapters emit (decoupled from any one feed's CSV)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class MasterRow:
    isin: str
    name: str
    nse_symbol: str | None = None
    bse_code: str | None = None
    bse_symbol: str | None = None
    series: str | None = None
    face_value: float | None = None
    listed_on: str | None = None


@dataclass(frozen=True)
class PriceRow:
    isin: str
    symbol: str
    date: str            # ISO YYYY-MM-DD
    open: float
    high: float
    low: float
    close: float
    volume: int
    exchange: str        # "NSE" | "BSE"
    name: str = ""       # company name when the feed carries it (UDiFF does)


@dataclass(frozen=True)
class CorpAction:
    isin: str
    ex_date: str         # ISO
    kind: str            # split | bonus | dividend
    ratio: float         # multiplicative price factor applied on/after ex_date
    detail: str
    source: str
    symbol: str = ""     # trading symbol from the feed; used to resolve the
    #                      canonical ISIN when the feed's ISIN differs from the
    #                      master's (e.g. post-merger ISIN changes like HDFCBANK).


def iso(d: date) -> str:
    return d.isoformat()
