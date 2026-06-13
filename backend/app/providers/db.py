"""Database-backed provider — reads the EOD spine built by the data engine.

Implements the same MarketDataProvider interface as SyntheticProvider, so the
screener, indicators, and API layers don't change at all. Select it with:

    TAUREYE_PROVIDER=db

Prices are returned corporate-action ADJUSTED (OHLC scaled by adj_factor, close
taken from adj_close) so moving averages and RSI stay continuous across splits.
Raw volume is preserved.
"""
from __future__ import annotations

from ..dataengine.db import connect
from ..dataengine.merge import merged_history, symbol_isins
from ..models import Candle, Security
from .base import MarketDataProvider


class DBProvider(MarketDataProvider):
    def __init__(self) -> None:
        self._symbol_to_isins: dict[str, list[str]] = {}

    def securities(self) -> list[Security]:
        out: list[Security] = []
        self._symbol_to_isins.clear()
        with connect() as conn:
            self._symbol_to_isins = symbol_isins(conn)
            # One Security per symbol, described by its LIVE ISIN (regimes[0]), so
            # a scrip that changed ISIN is not double-counted in the screener.
            for symbol, isins in self._symbol_to_isins.items():
                r = conn.execute(
                    """SELECT isin, name, nse_symbol, bse_symbol, sector,
                              shares_outstanding, segment
                       FROM securities WHERE isin=?""",
                    (isins[0],),
                ).fetchone()
                if not r:
                    continue
                exchange = "NSE" if r["nse_symbol"] else "BSE"
                out.append(
                    Security(
                        symbol=symbol,
                        name=r["name"] or symbol,
                        exchange=exchange,  # type: ignore[arg-type]
                        sector=r["sector"] or "Unknown",
                        isin=r["isin"],
                        shares_outstanding=r["shares_outstanding"],
                        segment=r["segment"],
                    )
                )
        return out

    def history(self, symbol: str) -> list[Candle]:
        isins = self._symbol_to_isins.get(symbol)
        with connect() as conn:
            if not isins:
                isins = symbol_isins(conn).get(symbol, [])
            if not isins:
                return []
            merged = merged_history(conn, isins)
        return [
            Candle(date=c["date"], open=c["open"], high=c["high"],
                   low=c["low"], close=c["close"], volume=c["volume"])
            for c in merged
        ]
