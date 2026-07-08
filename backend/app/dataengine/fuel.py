"""Daily retail fuel prices — India (per city) + global (per country).

Scraped nightly from free public aggregators and published as /data/fuel.json
(read by the app's Fuel tab). Fail-soft by design: any source that can't be
fetched or parsed is skipped so the rest of the bundle still publishes.

SOURCES (free, no key):
  - India:  goodreturns.in per-city pages — petrol, diesel, CNG, LPG
  - Global: globalpetrolprices.com country tables; falls back to
    numbeo.com gasoline rankings (petrol only) when GPP is unreachable.

⚠️  VALIDATION NOTE: these sites publish HTML (no official API), so the parsers
below are best-effort. Use `python -m backend.app.dataengine.run fuel` on the VM
to fetch and print what was parsed — it also prints per-source diagnostics
(HTTP status / parse misses) so a blocked or re-skinned source is obvious.
Premium petrol (XP95/Speed/Power) has no reliable free per-city source and
stays null; the app hides columns with no data.
"""
from __future__ import annotations

import re
from datetime import date

from .http import get_session

# Per-source fetch/parse diagnostics for the `run fuel` validator.
_DIAG: list[str] = []


def diagnostics() -> list[str]:
    return list(_DIAG)


def _get(url: str, timeout: float = 8.0) -> str | None:
    """Single-attempt GET with a short timeout — fuel prices are non-critical, so
    fail fast (don't use the aggressive retry infra that would make the nightly
    export hang if a source is blocked)."""
    try:
        r = get_session().get(url, timeout=timeout)
        if r.status_code == 200 and r.text:
            return r.text
        _DIAG.append(f"{url} -> HTTP {r.status_code}")
    except Exception as e:  # noqa: BLE001
        _DIAG.append(f"{url} -> {type(e).__name__}")
    return None


# Major Indian cities → (display name, state, goodreturns url slug).
# NOTE: Delhi is "new-delhi" on goodreturns — the "delhi" pages redirect to a
# generic listing whose first price is another city's (that's how Delhi briefly
# published Mumbai's ₹111.21 for petrol/diesel/CNG alike).
INDIA_CITIES: list[tuple[str, str, str]] = [
    ("Delhi", "Delhi", "new-delhi"),
    ("Mumbai", "Maharashtra", "mumbai"),
    ("Bengaluru", "Karnataka", "bangalore"),
    ("Chennai", "Tamil Nadu", "chennai"),
    ("Kolkata", "West Bengal", "kolkata"),
    ("Hyderabad", "Telangana", "hyderabad"),
    ("Pune", "Maharashtra", "pune"),
    ("Ahmedabad", "Gujarat", "ahmedabad"),
    ("Jaipur", "Rajasthan", "jaipur"),
    ("Lucknow", "Uttar Pradesh", "lucknow"),
    ("Chandigarh", "Chandigarh", "chandigarh"),
    ("Gurugram", "Haryana", "gurgaon"),
    ("Noida", "Uttar Pradesh", "noida"),
    ("Bhopal", "Madhya Pradesh", "bhopal"),
    ("Patna", "Bihar", "patna"),
]

# goodreturns city pages per fuel. CNG/LPG pages don't exist for every city —
# misses are fine (the field stays null and the app hides empty columns).
_GR_URL = {
    "petrol": "https://www.goodreturns.in/petrol-price-in-{slug}.html",
    "diesel": "https://www.goodreturns.in/diesel-price-in-{slug}.html",
    "cng": "https://www.goodreturns.in/cng-price-in-{slug}.html",
    "lpg": "https://www.goodreturns.in/lpg-price-in-{slug}.html",
}

# Plausible retail bands per fuel (₹). Prices outside are parse noise, not data.
_BAND = {
    "petrol": (60.0, 160.0),   # ₹/L
    "diesel": (55.0, 140.0),   # ₹/L
    "cng": (40.0, 150.0),      # ₹/kg
    "lpg": (400.0, 1500.0),    # ₹ / 14.2kg domestic cylinder
}

_RUPEE = r"(?:₹|Rs\.?|INR)\s*([0-9]{2,4}(?:\.[0-9]{1,2})?)"
_PRICE_ANY = re.compile(_RUPEE, re.I)
# A "Jul 06, 2026"-style date cell followed shortly by a ₹ price — goodreturns'
# last-10-days table, newest row first. The most reliable anchor on the page.
_DATE_PRICE = re.compile(
    r">((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4})<[^₹R]{0,240}?" + _RUPEE,
    re.I | re.S,
)


def _in_band(v: float, fuel: str) -> bool:
    lo, hi = _BAND[fuel]
    return lo <= v <= hi


def _parse_city_price(html: str, city: str, fuel: str) -> float | None:
    """Layered parse of a goodreturns city page — most-anchored first:
    1. newest row of the date/price history table,
    2. first price after the city's name,
    3. first in-band price anywhere (legacy heuristic).
    Every layer enforces the fuel's plausibility band."""
    m = _DATE_PRICE.search(html)
    if m:
        try:
            v = float(m.group(2))
            if _in_band(v, fuel):
                return v
        except ValueError:
            pass
    at = html.lower().find(city.lower())
    if at != -1:
        m = _PRICE_ANY.search(html, at, at + 1200)
        if m:
            try:
                v = float(m.group(1))
                if _in_band(v, fuel):
                    return v
            except ValueError:
                pass
    for m in _PRICE_ANY.finditer(html):
        try:
            v = float(m.group(1))
        except ValueError:
            continue
        if _in_band(v, fuel):
            return v
    return None


def scrape_india() -> list[dict]:
    """Per-city petrol/diesel/CNG/LPG (goodreturns). Cities that fail are
    skipped. Each fuel goes dead after 3 straight misses with no earlier hit —
    so a missing CNG/LPG section doesn't cost a timeout on every city, and a
    fully blocked source bails out early."""
    rows: list[dict] = []
    misses = dict.fromkeys(_GR_URL, 0)
    hits = dict.fromkeys(_GR_URL, 0)

    def fetch(fuel: str, slug: str, city: str) -> float | None:
        if misses[fuel] >= 3 and hits[fuel] == 0:
            return None  # source dead for this fuel — stop paying timeouts
        html = _get(_GR_URL[fuel].format(slug=slug))
        v = _parse_city_price(html, city, fuel) if html else None
        if v is None:
            misses[fuel] += 1
            if html is not None:
                _DIAG.append(f"{fuel}/{slug}: fetched but no in-band price parsed")
        else:
            hits[fuel] += 1
        return v

    for name, state, slug in INDIA_CITIES:
        petrol = fetch("petrol", slug, name)
        diesel = fetch("diesel", slug, name)
        if petrol is None and diesel is None and not rows and misses["petrol"] >= 3:
            break  # goodreturns itself is unreachable — don't grind every city
        cng = fetch("cng", slug, name)
        lpg = fetch("lpg", slug, name)
        # Redirect guard: distinct fuels never share the exact same price to the
        # paisa. Identical values mean the city's pages redirected to a common
        # listing and we parsed the same stranger's price N times — keep petrol
        # (the least likely to be absent) and drop the clones.
        if petrol is not None:
            if diesel == petrol:
                diesel = None
                _DIAG.append(f"{slug}: diesel == petrol ({petrol}) — dropped as redirect artifact")
            if cng == petrol:
                cng = None
                _DIAG.append(f"{slug}: cng == petrol ({petrol}) — dropped as redirect artifact")
        if petrol is None and diesel is None and cng is None and lpg is None:
            continue
        rows.append(
            {
                "city": name,
                "state": state,
                "petrol": petrol,
                "premium_petrol": None,  # no reliable free per-city source
                "diesel": diesel,
                "cng": cng,
                "lpg": lpg,
            }
        )
    return rows


_GPP_PETROL = "https://www.globalpetrolprices.com/gasoline_prices/"
_GPP_DIESEL = "https://www.globalpetrolprices.com/diesel_prices/"
# Numbeo's rankings page 404s now; the per-country pages are static HTML and
# can render in USD directly.
_NUMBEO_COUNTRY = "https://www.numbeo.com/gas-prices/country_result.jsp?country={c}&displayCurrency=USD"

# globalpetrolprices' per-country list is rendered by JS, but the data ships in
# the page as inline chart pairs: ["Country", 1.23]. That's the primary parse.
_GPP_DATA_PAIR = re.compile(
    r'\[\s*"([A-Z][A-Za-z .&\'()-]{2,40})"\s*,\s*([0-9]+\.[0-9]{2,3})\s*\]',
)
# Legacy/fallback shapes in case the embedding changes back to server-rendered rows.
_GPP_ROW = re.compile(
    r'graph_outer_div[^>]*>.*?>([A-Z][A-Za-z .&\'-]{2,40})</a>.*?([0-9]\.[0-9]{2,3})',
    re.S,
)
_GPP_ROW_ALT = re.compile(
    r'href="/[a-z_]+/(?:[A-Za-z-]+)/"[^>]*>([A-Z][A-Za-z .&\'-]{2,40})</a>[^0-9]{0,160}([0-9]\.[0-9]{2,3})',
    re.S,
)
_GPP_REGEXES = (_GPP_DATA_PAIR, _GPP_ROW, _GPP_ROW_ALT)


def _scrape_gpp(url: str) -> dict[str, float]:
    out: dict[str, float] = {}
    html = _get(url, timeout=10.0)
    if not html:
        return out
    for rx in _GPP_REGEXES:
        for m in rx.finditer(html):
            country = m.group(1).strip()
            try:
                price = float(m.group(2))
            except ValueError:
                continue
            if country and 0.1 <= price <= 5.0:  # USD/L sanity band
                out.setdefault(country, price)
        # A real country list has dozens of rows; a couple of hits is JS noise.
        if len(out) >= 10:
            break
        out.clear()
    if not out:
        _DIAG.append(f"{url}: fetched but no rows parsed")
    return out


def _numbeo_gas_usd(html: str) -> float | None:
    """Price from a numbeo country page rendered in USD: the value following
    the "Gasoline (1 liter)" row label."""
    at = html.find("Gasoline (1 liter)")
    if at == -1:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]{1,2})?)\s*(?:&nbsp;|\s)*\$", html[at: at + 600])
    if not m:
        return None
    try:
        v = float(m.group(1))
    except ValueError:
        return None
    return v if 0.1 <= v <= 5.0 else None


def _scrape_numbeo_petrol() -> dict[str, float]:
    """Per-country gasoline (USD/L) from numbeo country pages — one request per
    preferred country, early-abort if the site is down/blocked."""
    from urllib.parse import quote

    out: dict[str, float] = {}
    misses = 0
    for c in GLOBAL_PREFERRED:
        html = _get(_NUMBEO_COUNTRY.format(c=quote(c)), timeout=10.0)
        v = _numbeo_gas_usd(html) if html else None
        if v is None:
            misses += 1
            if html is not None:
                _DIAG.append(f"numbeo/{c}: fetched but no gasoline price parsed")
            if misses >= 3 and not out:
                break  # source unreachable/re-skinned — stop paying timeouts
            continue
        out[c] = v
    return out


# Countries to surface on the Global table (others are still scraped if present).
GLOBAL_PREFERRED = [
    "India", "United States", "United Kingdom", "United Arab Emirates", "Singapore",
    "Australia", "Canada", "Germany", "France", "Japan", "China", "Saudi Arabia",
    "Russia", "Brazil", "South Africa", "Pakistan", "Sri Lanka", "Nepal", "Bangladesh",
]


def scrape_global() -> list[dict]:
    """Per-country petrol + diesel in USD/litre. globalpetrolprices first;
    numbeo (petrol only) as the fallback when GPP is blocked/unparseable."""
    petrol = _scrape_gpp(_GPP_PETROL)
    diesel = _scrape_gpp(_GPP_DIESEL)
    source = "globalpetrolprices.com"
    if not petrol and not diesel:
        petrol = _scrape_numbeo_petrol()
        source = "numbeo.com"
    countries = list(dict.fromkeys([*GLOBAL_PREFERRED, *petrol.keys()]))
    rows: list[dict] = []
    for c in countries:
        p = petrol.get(c)
        d = diesel.get(c)
        if p is None and d is None:
            continue
        rows.append({"country": c, "petrol": p, "diesel": d, "lpg": None, "currency": "USD", "unit": "litre"})
    scrape_global.last_source = source  # type: ignore[attr-defined]
    return rows


def _ctx(html: str, at: int, span: int = 150) -> str:
    """A compact one-line context window around a match, for probe output."""
    return " ".join(html[max(0, at - span): at + span].split())


def probe(target: str) -> None:
    """Print what a fuel source actually serves, to tune the parsers without
    guessing. Targets:
      global           — GPP gasoline/diesel pages + the numbeo fallback
      <fuel>:<slug>    — one goodreturns city page, e.g. petrol:new-delhi
    """
    _DIAG.clear()
    if target == "global":
        from urllib.parse import quote

        for url in (_GPP_PETROL, _GPP_DIESEL):
            html = _get(url, timeout=10.0)
            print(f"== {url}")
            if not html:
                print(f"   FETCH FAILED: {_DIAG[-1] if _DIAG else 'unknown'}")
                continue
            print(f"   {len(html)} bytes")
            for i, rx in enumerate(_GPP_REGEXES):
                hits = rx.findall(html)
                sample = f"  e.g. {hits[0]}" if hits else ""
                print(f"   regex#{i}: {len(hits)} matches{sample}")
        for c in ("India", "United States"):
            url = _NUMBEO_COUNTRY.format(c=quote(c))
            html = _get(url, timeout=10.0)
            print(f"== {url}")
            if not html:
                print(f"   FETCH FAILED: {_DIAG[-1] if _DIAG else 'unknown'}")
                continue
            at = html.find("Gasoline (1 liter)")
            print(f"   {len(html)} bytes; parsed -> {_numbeo_gas_usd(html)}")
            print(f"   ctx[Gasoline]: {_ctx(html, at, 200) if at != -1 else '(label not found)'}")
        return
    fuel, _, slug = target.partition(":")
    if fuel not in _GR_URL or not slug:
        print(f"usage: fuel-probe global | <{'|'.join(_GR_URL)}>:<slug>")
        return
    url = _GR_URL[fuel].format(slug=slug)
    html = _get(url)
    print(f"== {url}")
    if not html:
        print(f"   FETCH FAILED: {_DIAG[-1] if _DIAG else 'unknown'}")
        return
    print(f"   {len(html)} bytes; parsed -> {_parse_city_price(html, slug.replace('-', ' '), fuel)}")
    for i, m in enumerate(_PRICE_ANY.finditer(html)):
        if i >= 5:
            break
        print(f"   ₹match {m.group(1)}: … {_ctx(html, m.start(), 110)}")


def build_fuel_bundle() -> dict:
    """Assemble the fuel.json payload. Each source is isolated so a failure in
    one still yields the other."""
    _DIAG.clear()
    try:
        india = scrape_india()
    except Exception:
        india = []
    try:
        world = scrape_global()
    except Exception:
        world = []
    return {
        "meta": {
            "data_date": date.today().isoformat(),
            "source_india": "goodreturns.in",
            "source_global": getattr(scrape_global, "last_source", "globalpetrolprices.com"),
        },
        "india": india,
        "global": world,
    }
