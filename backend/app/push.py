"""Server-side push sender — FCM HTTP v1 via firebase-admin.

Broadcasts to a topic (Strategy A), so no device-token database is needed: the
app subscribes every device to the "eod" topic and the nightly cron calls this
after the export to notify "data updated".

Fully fail-soft: if the service-account credentials aren't present (e.g. before
setup, or in environments without FCM) it logs and returns instead of raising,
so it can never break the nightly refresh.

Credentials: a Firebase service-account JSON (Project settings -> Service
accounts -> Generate new private key). Point TAUREYE_FCM_CREDENTIALS at it, or
place it at /opt/taureye/secrets/fcm.json. Keep it secret (never commit).

Run as a module to send the default EOD notification:
    python -m backend.app.push
"""
from __future__ import annotations

import os

_SA_PATH = os.environ.get("TAUREYE_FCM_CREDENTIALS", "/opt/taureye/secrets/fcm.json")
_TOPIC = os.environ.get("TAUREYE_FCM_TOPIC", "eod")
_app = None


def _ensure_app() -> bool:
    global _app
    if _app is not None:
        return True
    if not os.path.exists(_SA_PATH):
        print(f"[push] no FCM credentials at {_SA_PATH}; skipping push")
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials
        _app = firebase_admin.initialize_app(credentials.Certificate(_SA_PATH))
        return True
    except Exception as e:  # noqa: BLE001 — fail soft
        print(f"[push] could not init firebase-admin: {type(e).__name__}: {e}")
        return False


def notify_topic(title: str, body: str, data: dict | None = None,
                 topic: str = _TOPIC) -> bool:
    """Broadcast a notification to a topic. Returns True if sent."""
    if not _ensure_app():
        return False
    try:
        from firebase_admin import messaging
        messaging.send(messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            topic=topic,
        ))
        print(f"[push] sent to topic '{topic}': {title}")
        return True
    except Exception as e:  # noqa: BLE001 — fail soft
        print(f"[push] send failed: {type(e).__name__}: {e}")
        return False


if __name__ == "__main__":
    notify_topic("TaurEye", "Today's end-of-day data is updated — check your watchlist.")
