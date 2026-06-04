"""Market-data provider interface.

Everything in TaurEye reads market data through this interface so the
synthetic source used in Phase 1 can be swapped for DHAN (or any vendor)
later without touching the screener or API layers.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import Candle, Security


class MarketDataProvider(ABC):
    @abstractmethod
    def securities(self) -> list[Security]:
        """Full tradable universe (NSE + BSE scrips)."""

    @abstractmethod
    def history(self, symbol: str) -> list[Candle]:
        """Daily EOD OHLCV for a symbol, oldest first."""
