"""Robust HTTP layer for the exchange archives.

Two things make NSE/BSE downloads finicky:
  1. They reject requests that don't look like a browser (User-Agent + Referer).
  2. NSE's API endpoints require a session cookie that you only get by first
     hitting the homepage. We prime that cookie before calling the JSON API.

Everything goes through a single retrying session with exponential backoff so a
transient blip doesn't fail a nightly run. Raw bytes are cached to data/raw/ for
audit and offline replay (re-running a date never needs a second download).
"""
from __future__ import annotations

import io
import time
import zipfile
from collections.abc import Callable
from pathlib import Path

import requests


class FetchError(RuntimeError):
    """A download failed or returned content that failed validation."""


def is_zip(data: bytes) -> bool:
    """ZIP files start with the local-file-header magic 'PK\\x03\\x04'."""
    return data[:4] == b"PK\x03\x04"


def looks_like_html(data: bytes) -> bool:
    """NSE/BSE return a 200 HTML error/blocked page instead of the file.

    Treat those as failures so they never get cached or parsed as data.
    """
    head = data[:512].lstrip().lower()
    return head.startswith(b"<!doctype") or head.startswith(b"<html") or b"<head" in head


def not_html(data: bytes) -> bool:
    return bool(data) and not looks_like_html(data)

from .config import (
    BSE_HOME,
    CACHE_DIR,
    HTTP_BACKOFF,
    HTTP_RETRIES,
    HTTP_TIMEOUT,
    NSE_HOME,
    NSE_QUOTE_PAGE,
    USER_AGENT,
    ensure_dirs,
)

_session: requests.Session | None = None
_nse_primed = False
_nse_quotes_primed = False


def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/json,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
        }
    )
    return s


def get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = _make_session()
    return _session


def prime_nse() -> None:
    """Fetch a cookie from the NSE homepage so API/archive calls are accepted."""
    global _nse_primed
    if _nse_primed:
        return
    s = get_session()
    try:
        s.get(NSE_HOME, timeout=HTTP_TIMEOUT)
        _nse_primed = True
    except requests.RequestException:
        # Non-fatal: some archive paths work without the cookie. The actual
        # download still retries below.
        pass


def prime_nse_quotes(force: bool = False) -> None:
    """Warm the NSE *quotes* section so the quote-equity API is accepted.

    The homepage alone is not enough for the JSON APIs: Akamai's bot manager
    only issues the bm_sv / bm_sz cookies the API checks when you load an actual
    get-quotes HTML page. We hit one (RELIANCE) once per session to collect those
    cookies; pass force=True to re-warm after a 403 (the cookies can expire).
    """
    global _nse_quotes_primed
    if _nse_quotes_primed and not force:
        return
    s = get_session()
    prime_nse()
    try:
        s.get(
            NSE_QUOTE_PAGE.format(sym="RELIANCE"),
            headers={"Referer": NSE_HOME + "/"},
            timeout=HTTP_TIMEOUT,
        )
        _nse_quotes_primed = True
    except requests.RequestException:
        pass


def _referer_for(url: str) -> str:
    if "bseindia" in url:
        return BSE_HOME + "/"
    if "nseindia" in url:
        return NSE_HOME + "/"
    return ""


def fetch_bytes(
    url: str,
    cache_name: str | None = None,
    validate: Callable[[bytes], bool] | None = None,
    referer: str | None = None,
    accept: str | None = None,
) -> bytes:
    """GET a URL with retries/backoff, validating the body before trusting it.

    `validate` is a predicate on the raw bytes (e.g. is_zip, not_html). A 200
    response whose body fails validation is treated as a transient error and
    retried — it is NEVER cached, so an HTML error page can't poison data/raw/.

    A previously cached file is only reused if it still passes validation;
    a stale/poisoned cache file is ignored and re-fetched.
    """
    ensure_dirs()
    cache_path: Path | None = CACHE_DIR / cache_name if cache_name else None
    if cache_path and cache_path.exists() and cache_path.stat().st_size > 0:
        cached = cache_path.read_bytes()
        if validate is None or validate(cached):
            return cached
        # Poisoned/partial cache from an older run — drop it and re-fetch.
        try:
            cache_path.unlink()
        except OSError:
            pass

    if "nseindia" in url:
        prime_nse()

    s = get_session()
    headers = {}
    ref = referer or _referer_for(url)
    if ref:
        headers["Referer"] = ref
    if accept:
        headers["Accept"] = accept

    last_err: Exception | None = None
    for attempt in range(HTTP_RETRIES):
        try:
            resp = s.get(url, headers=headers, timeout=HTTP_TIMEOUT)
            if resp.status_code == 200 and resp.content:
                if validate is not None and not validate(resp.content):
                    # A 200 with the wrong body (e.g. an HTML error/SPA page) will
                    # return the SAME body on retry — retrying is pointless, so
                    # fail fast instead of burning the backoff budget.
                    raise FetchError(
                        f"{url} returned {len(resp.content)} bytes that failed "
                        f"validation (HTML error page, not the file) - no data for "
                        f"this date, or the URL is wrong"
                    )
                if cache_path:
                    cache_path.write_bytes(resp.content)
                return resp.content
            if resp.status_code in (429,) or 500 <= resp.status_code < 600:
                # Transient server-side — worth a retry.
                last_err = FetchError(f"HTTP {resp.status_code} for {url}")
            else:
                # 4xx (404 etc.) won't fix itself — fail fast.
                raise FetchError(f"HTTP {resp.status_code} for {url}")
        except requests.RequestException as e:
            last_err = e  # network blip — retryable
        time.sleep(HTTP_BACKOFF * (2**attempt))
    raise FetchError(f"Failed to fetch {url} after {HTTP_RETRIES} tries: {last_err}")


def fetch_text(
    url: str,
    cache_name: str | None = None,
    encoding: str = "utf-8",
    validate: Callable[[bytes], bool] | None = not_html,
    referer: str | None = None,
    accept: str | None = None,
) -> str:
    return fetch_bytes(
        url, cache_name, validate=validate, referer=referer, accept=accept
    ).decode(encoding, errors="replace")


def fetch_zip_member(url: str, cache_name: str | None = None, member: str | None = None) -> str:
    """Download a validated .zip and return one member's text.

    The body is checked for the ZIP magic before we try to open it, so a server
    error page yields a clear FetchError instead of a raw BadZipFile.
    """
    raw = fetch_bytes(url, cache_name, validate=is_zip)
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
        name = member or zf.namelist()[0]
        return zf.read(name).decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, IndexError, KeyError) as e:
        raise FetchError(f"{url} did not contain a readable zip member: {e}") from e
