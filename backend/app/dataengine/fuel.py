"""Daily retail fuel prices — India (per city) + global (per country).

Scraped nightly from free public aggregators and published as /data/fuel.json
(read by the app's Fuel tab). Fail-soft by design: any source that can't be
fetched or parsed is skipped so the rest of the bundle still publishes.

SOURCES (free, no key):
  - India:  goodreturns.in per-city petrol/diesel pages
  - Global: globalpetrolprices.com gasoline/diesel country tables

⚠️  VALIDATION NOTE: these sites publish HTML (no official API), so the regex
parsers below are best-effort and WILL need tuning against the live markup on
first run. Use `python -m backend.app.dataengine.run fuel` on the VM to fetch
and print what was parsed, then adjust the patterns / city slugs as needed.
Premium petrol (XP95/Speed/Power), CNG and LPG are not consistently published
free per city — those fields stay null until a source is wired for them.
"""
from __future__ import annotations

import re
from datetime import date

from .http import get_session


def _get(url: str, timeout: float = 8.0) -> str | None:
    """Single-attempt GET with a short timeout — fuel prices are non-critical, so
    fail fast (don't use the aggressive retry infra that would make the nightly
    export hang if a source is blocked)."""
    try:
        r = get_session().get(url, timeout=timeout)
        if r.status_code == 200 and r.text:
            return r.text
    except Exception:
        pass
    return None

# Major Indian cities → (display name, state, goodreturns url slug).
INDIA_CITIES: list[tuple[str, str, str]] = [
    ("Delhi", "Delhi", "delhi"),
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

_GR_PETROL = "https://www.goodreturns.in/petrol-price-in-{slug}.html"
_GR_DIESEL = "https://www.goodreturns.in/diesel-price-in-{slug}.html"
_GPP_PETROL = "https://www.globalpetrolprices.com/gasoline_prices/"
_GPP_DIESEL = "https://www.globalpetrolprices.com/diesel_prices/"

# A ₹ price like "96.72" — the first plausible fuel price near the top of a page.
_PRICE = re.compile(r"₹\s*([0-9]{1,3}(?:\.[0-9]{1,2})?)")
_PRICE_ALT = re.compile(r"(?:Rs\.?|INR)\s*([0-9]{1,3}\.[0-9]{1,2})", re.I)


def _first_price(html: str) -> float | None:
    for rx in (_PRICE, _PRICE_ALT):
        m = rx.search(html)
        if m:
            try:
                v = float(m.group(1))
                if 40 <= v <= 250:  # sanity: retail petrol/diesel band (₹/L)
                    return v
            except ValueError:
                pass
    return None


def _scrape_gr(url: str) -> float | None:
    html = _get(url)
    return _first_price(html) if html else None


def scrape_india() -> list[dict]:
    """Per-city petrol + diesel (goodreturns). Cities that fail are skipped; if
    the first few cities all fail the source is likely down/blocked, so bail."""
    rows: list[dict] = []
    misses = 0
    for name, state, slug in INDIA_CITIES:
        petrol = _scrape_gr(_GR_PETROL.format(slug=slug))
        diesel = _scrape_gr(_GR_DIESEL.format(slug=slug))
        if petrol is None and diesel is None:
            misses += 1
            if misses >= 3 and not rows:
                break  # source unreachable — don't grind through every city
            continue
        misses = 0
        rows.append(
            {
                "city": name,
                "state": state,
                "petrol": petrol,
                "premium_petrol": None,  # not on the free source
                "diesel": diesel,
                "cng": None,
                "lpg": None,
            }
        )
    return rows


# globalpetrolprices lists rows like: <country> ... <price> (USD/litre).
_GPP_ROW = re.compile(
    r'graph_outer_div[^>]*>.*?>([A-Z][A-Za-z .&\'-]{2,40})</a>.*?([0-9]\.[0-9]{2,3})',
    re.S,
)


def _scrape_gpp(url: str) -> dict[str, float]:
    out: dict[str, float] = {}
    html = _get(url, timeout=10.0)
    if not html:
        return out
    for m in _GPP_ROW.finditer(html):
        country = m.group(1).strip()
        try:
            price = float(m.group(2))
        except ValueError:
            continue
        if country and 0.1 <= price <= 5.0:  # USD/L sanity band
            out.setdefault(country, price)
    return out


# Countries to surface on the Global table (others are still scraped if present).
GLOBAL_PREFERRED = [
    "India", "United States", "United Kingdom", "United Arab Emirates", "Singapore",
    "Australia", "Canada", "Germany", "France", "Japan", "China", "Saudi Arabia",
    "Russia", "Brazil", "South Africa", "Pakistan", "Sri Lanka", "Nepal", "Bangladesh",
]


def scrape_global() -> list[dict]:
    """Per-country petrol + diesel (globalpetrolprices, USD/litre)."""
    petrol = _scrape_gpp(_GPP_PETROL)
    diesel = _scrape_gpp(_GPP_DIESEL)
    countries = list(dict.fromkeys([*GLOBAL_PREFERRED, *petrol.keys()]))
    rows: list[dict] = []
    for c in countries:
        p = petrol.get(c)
        d = diesel.get(c)
        if p is None and d is None:
            continue
        rows.append({"country": c, "petrol": p, "diesel": d, "lpg": None, "currency": "USD", "unit": "litre"})
    return rows


def build_fuel_bundle() -> dict:
    """Assemble the fuel.json payload. Each source is isolated so a failure in
    one still yields the other."""
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
            "source_global": "globalpetrolprices.com",
        },
        "india": india,
        "global": world,
    }
