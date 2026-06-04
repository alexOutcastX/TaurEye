"""In-memory market store + saved-screen persistence.

Builds the metrics snapshot for the whole universe once at startup.
Saved screens persist to a JSON file next to the backend.
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .indicators import compute_metrics
from .models import Metrics, SavedScreen, SaveScreenRequest, Security
from .providers import get_provider

_SAVED_PATH = Path(__file__).resolve().parent.parent / "saved_screens.json"


class Store:
    def __init__(self) -> None:
        self.provider = get_provider()
        self.securities: list[Security] = self.provider.securities()
        self.metrics: dict[str, Metrics] = {}
        self._build_metrics()

    def _build_metrics(self) -> None:
        for sec in self.securities:
            candles = self.provider.history(sec.symbol)
            self.metrics[sec.symbol] = compute_metrics(sec, list(candles))

    def all_metrics(self) -> list[Metrics]:
        return list(self.metrics.values())

    def candles(self, symbol: str):
        return list(self.provider.history(symbol))

    # ---- saved screens ----
    def load_saved(self) -> list[SavedScreen]:
        if not _SAVED_PATH.exists():
            return []
        try:
            raw = json.loads(_SAVED_PATH.read_text(encoding="utf-8"))
            return [SavedScreen(**item) for item in raw]
        except Exception:
            return []

    def _write_saved(self, items: list[SavedScreen]) -> None:
        _SAVED_PATH.write_text(
            json.dumps([i.model_dump() for i in items], indent=2),
            encoding="utf-8",
        )

    def save_screen(self, req: SaveScreenRequest) -> SavedScreen:
        items = self.load_saved()
        screen = SavedScreen(
            id=uuid.uuid4().hex[:8],
            name=req.name,
            request=req.request,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        items.append(screen)
        self._write_saved(items)
        return screen

    def delete_screen(self, screen_id: str) -> bool:
        items = self.load_saved()
        kept = [i for i in items if i.id != screen_id]
        if len(kept) == len(items):
            return False
        self._write_saved(kept)
        return True


_store: Store | None = None
_store_lock = threading.Lock()


def get_store() -> Store:
    # Double-checked locking: the heavy build runs exactly once even if the
    # background warm-up thread and an incoming request race to create it.
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                _store = Store()
    return _store
