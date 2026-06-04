"""Provider factory.

Phase 1 uses SyntheticProvider. To wire DHAN later, implement a
DhanProvider(MarketDataProvider) and switch on the TAUREYE_PROVIDER env var.
"""
from __future__ import annotations

import os

from .base import MarketDataProvider
from .synthetic import SyntheticProvider

_instance: MarketDataProvider | None = None


def get_provider() -> MarketDataProvider:
    global _instance
    if _instance is None:
        name = os.getenv("TAUREYE_PROVIDER", "synthetic").lower()
        if name == "synthetic":
            _instance = SyntheticProvider()
        elif name == "db":
            # Real EOD spine built by backend.app.dataengine (NSE/BSE bhavcopy).
            from .db import DBProvider
            _instance = DBProvider()
        else:
            # Placeholder: real vendors (e.g. DHAN) plug in here.
            raise RuntimeError(
                f"Unknown provider '{name}'. Use 'synthetic' or 'db'."
            )
    return _instance
