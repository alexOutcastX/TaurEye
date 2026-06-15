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


def notify_token(token: str, title: str, body: str, data: dict | None = None) -> bool:
    """Send directly to one device token (bypasses topic propagation — for tests)."""
    if not _ensure_app():
        return False
    try:
        from firebase_admin import messaging
        msg_id = messaging.send(messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=token,
        ))
        print(f"[push] sent to token: {msg_id}")
        return True
    except Exception as e:  # noqa: BLE001 — surfaces e.g. token-not-registered
        print(f"[push] token send failed: {type(e).__name__}: {e}")
        return False


def _read_data_date(bundle_dir: str) -> str | None:
    """The EOD spine date the exporter stamped onto indices.json (the bundle's
    freshness signal). Returns None if it can't be read."""
    import json
    path = os.path.join(bundle_dir, "indices.json")
    try:
        with open(path) as f:
            return (json.load(f) or {}).get("data_date")
    except Exception as e:  # noqa: BLE001 — fail soft
        print(f"[push] couldn't read data_date from {path}: {type(e).__name__}: {e}")
        return None


def notify_eod_if_fresh(bundle_dir: str, state_dir: str | None = None) -> bool:
    """Send the EOD push ONLY when the bundle's data_date advanced since the last
    notification.

    The nightly cron republishes the bundle even when the data pull fails ("…
    republishing anyway"), so an unconditional push would announce "data updated"
    with no new data — and stays silent on weekends/holidays when the date doesn't
    move. Gating on data_date makes the notification truthful and carries the date.
    """
    state_dir = state_dir or bundle_dir
    date = _read_data_date(bundle_dir)
    if not date:
        print("[push] no data_date in bundle; skipping EOD push")
        return False
    state = os.path.join(state_dir, ".last_push_date")
    last = None
    try:
        with open(state) as f:
            last = f.read().strip()
    except FileNotFoundError:
        pass
    except Exception as e:  # noqa: BLE001
        print(f"[push] state read failed: {type(e).__name__}: {e}")
    if last == date:
        print(f"[push] data_date {date} unchanged since last push; skipping (no fresh data)")
        return False
    ok = notify_topic("TaurEye", f"End-of-day data for {date} is in — check your watchlist.",
                      data={"data_date": date})
    if ok:
        try:
            with open(state, "w") as f:
                f.write(date)
        except Exception as e:  # noqa: BLE001
            print(f"[push] state write failed: {type(e).__name__}: {e}")
    return ok


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="Send a TaurEye push (topic by default).")
    p.add_argument("--token", help="send directly to this device token instead of the topic")
    p.add_argument("--title", default="TaurEye")
    p.add_argument("--body", default="Today's end-of-day data is updated — check your watchlist.")
    p.add_argument("--eod-if-fresh", metavar="BUNDLE_DIR",
                   help="send the EOD push only if data_date in BUNDLE_DIR/indices.json advanced")
    args = p.parse_args()
    if args.eod_if_fresh:
        notify_eod_if_fresh(args.eod_if_fresh)
    elif args.token:
        notify_token(args.token, args.title, args.body)
    else:
        notify_topic(args.title, args.body)
