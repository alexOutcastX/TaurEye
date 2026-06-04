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
from ..models import Candle, Security
from .base import MarketDataProvider


class DBProvider(MarketDataProvider):
    def __init__(self) -> None:
        self._symbol_to_isin: dict[str, str] = {}

    def securities(self) -> list[Security]:
        out: list[Security] = []
        self._symbol_to_isin.clear()
        with connect() as conn:
            # Only securities that actually have at least one price row.
            rows = conn.execute(
                """SELECT s.isin, s.name, s.nse_symbol, s.bse_symbol, s.sector,
                          s.shares_outstanding, s.segment
                   FROM securities s
                   WHERE EXISTS (SELECT 1 FROM prices p WHERE p.isin = s.isin)"""
            ).fetchall()
            for r in rows:
                symbol = r["nse_symbol"] or r["bse_symbol"]
                if not symbol:
                    continue
                exchange = "NSE" if r["nse_symbol"] else "BSE"
                self._symbol_to_isin[symbol] = r["isin"]
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
        isin = self._symbol_to_isin.get(symbol)
        if isin is None:
            with connect() as conn:
                row = conn.execute(
                    "SELECT isin FROM securities WHERE nse_symbol=? OR bse_symbol=? LIMIT 1",
                    (symbol, symbol),
                ).fetchone()
                if not row:
                    return []
                isin = row["isin"]

        with connect() as conn:
            rows = conn.execute(
                "SELECT date, open, high, low, close, volume, adj_factor, adj_close"
                " FROM prices WHERE isin=? ORDER BY date",
                (isin,),
            ).fetchall()

        candles: list[Candle] = []
        for r in rows:
            f = r["adj_factor"] or 1.0
            candles.append(
                Candle(
                    date=r["date"],
                    open=round(r["open"] * f, 4),
                    high=round(r["high"] * f, 4),
                    low=round(r["low"] * f, 4),
                    close=r["adj_close"],
                    volume=int(r["volume"]),
                )
            )
        return candles
