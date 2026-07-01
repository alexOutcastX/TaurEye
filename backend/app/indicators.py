"""Pure-Python technical indicators (no numpy/pandas dependency).

Computes a latest-snapshot Metrics object from a list of daily candles.
"""
from __future__ import annotations

from .models import Candle, Metrics, Security


def sma(values: list[float], period: int) -> float:
    if len(values) < period:
        return 0.0
    return sum(values[-period:]) / period


def ema_series(values: list[float], period: int) -> list[float]:
    if not values:
        return []
    k = 2 / (period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) <= period:
        return 50.0
    gains = 0.0
    losses = 0.0
    # seed
    for i in range(1, period + 1):
        ch = closes[i] - closes[i - 1]
        if ch >= 0:
            gains += ch
        else:
            losses -= ch
    avg_gain = gains / period
    avg_loss = losses / period
    # Wilder smoothing
    for i in range(period + 1, len(closes)):
        ch = closes[i] - closes[i - 1]
        gain = ch if ch > 0 else 0.0
        loss = -ch if ch < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def macd_hist(closes: list[float]) -> float:
    if len(closes) < 35:
        return 0.0
    ema12 = ema_series(closes, 12)
    ema26 = ema_series(closes, 26)
    macd_line = [a - b for a, b in zip(ema12, ema26)]
    signal = ema_series(macd_line[-40:], 9)
    return round(macd_line[-1] - signal[-1], 3)


def atr_pct(candles: list[Candle], period: int = 14) -> float:
    if len(candles) <= period:
        return 0.0
    trs: list[float] = []
    for i in range(1, len(candles)):
        c = candles[i]
        pc = candles[i - 1].close
        tr = max(c.high - c.low, abs(c.high - pc), abs(c.low - pc))
        trs.append(tr)
    atr = sum(trs[-period:]) / period
    last_close = candles[-1].close
    return round(atr / last_close * 100, 2) if last_close else 0.0


def _pct(a: float, b: float) -> float:
    return round((a / b - 1) * 100, 2) if b else 0.0


# ---- Support / Resistance: nearest swing level, per timeframe (D / W / M) ----
def _iso_week_key(date: str) -> str:
    import datetime

    y, m, d = (int(x) for x in date[:10].split("-"))
    iso = datetime.date(y, m, d).isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def resample(candles: list[Candle], tf: str) -> list[Candle]:
    """Aggregate daily candles into weekly ('W') or monthly ('M') OHLCV bars.
    'D' returns the input unchanged."""
    if tf == "D":
        return candles
    buckets: dict[str, list[Candle]] = {}
    order: list[str] = []
    for c in candles:
        key = c.date[:7] if tf == "M" else _iso_week_key(c.date)
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(c)
    out: list[Candle] = []
    for key in order:
        grp = buckets[key]
        out.append(
            Candle(
                date=grp[-1].date,
                open=grp[0].open,
                high=max(x.high for x in grp),
                low=min(x.low for x in grp),
                close=grp[-1].close,
                volume=sum(x.volume for x in grp),
            )
        )
    return out


def _pivot_levels(candles: list[Candle], k: int) -> tuple[list[float], list[float]]:
    """Swing highs/lows: a bar whose high/low is the strict extreme within ±k bars."""
    highs: list[float] = []
    lows: list[float] = []
    n = len(candles)
    for i in range(k, n - k):
        h = candles[i].high
        if all(candles[j].high <= h for j in range(i - k, i + k + 1) if j != i):
            highs.append(h)
        lo = candles[i].low
        if all(candles[j].low >= lo for j in range(i - k, i + k + 1) if j != i):
            lows.append(lo)
    return highs, lows


def support_resistance(candles: list[Candle], tf: str, k: int) -> tuple[float, float]:
    """(% from support, % from resistance) on the given timeframe.

    Resistance = the nearest swing high ABOVE the latest close; support = the
    nearest swing low BELOW it. Falls back to the period high/low when there is
    no pivot on that side. Signs mirror the 52-week fields: the support distance
    is >= 0 (price sits above support) and the resistance distance is <= 0
    (price sits below resistance)."""
    bars = resample(candles, tf)
    if len(bars) < 2 * k + 2:
        return 0.0, 0.0
    close = bars[-1].close
    highs, lows = _pivot_levels(bars, k)
    above = [h for h in highs if h > close]
    below = [lo for lo in lows if lo < close]
    resistance = min(above) if above else max(b.high for b in bars)
    support = max(below) if below else min(b.low for b in bars)
    return _pct(close, support), _pct(close, resistance)


def sma_at(values: list[float], period: int, back: int = 0) -> float | None:
    """SMA of `period` closes ending `back` bars before the latest (0 = latest)."""
    end = len(values) - back
    if end < period:
        return None
    seg = values[end - period:end]
    return sum(seg) / period


def _macd_hist_at(closes: list[float], back: int) -> float | None:
    """MACD histogram value `back` bars from the end (for cross detection)."""
    if len(closes) < 35 + back:
        return None
    ema12 = ema_series(closes, 12)
    ema26 = ema_series(closes, 26)
    line = [a - b for a, b in zip(ema12, ema26)]
    sig = ema_series(line[-(40 + back):], 9)
    return line[-(1 + back)] - sig[-(1 + back)]


def compute_metrics(sec: Security, candles: list[Candle]) -> Metrics:
    closes = [c.close for c in candles]
    vols = [c.volume for c in candles]
    last = candles[-1]
    prev_close = candles[-2].close if len(candles) > 1 else last.close

    sma20 = round(sma(closes, 20), 2)
    sma50 = round(sma(closes, 50), 2)
    sma200 = round(sma(closes, 200), 2)

    window_52w = candles[-252:] if len(candles) >= 252 else candles
    high_52w = max(c.high for c in window_52w)
    low_52w = min(c.low for c in window_52w)

    # Nearest support/resistance on the daily, weekly and monthly timeframes.
    sup_d, res_d = support_resistance(candles, "D", 5)
    sup_w, res_w = support_resistance(candles, "W", 3)
    sup_m, res_m = support_resistance(candles, "M", 2)

    avg_vol_20 = sum(vols[-20:]) / min(20, len(vols)) if vols else 0
    rel_vol = round(last.volume / avg_vol_20, 2) if avg_vol_20 else 0.0

    # Market cap = close price x issued shares, expressed in ₹ crore (1 cr = 1e7).
    # shares_outstanding comes from the data engine's NSE issuedSize enrichment.
    # When it's unavailable (e.g. BSE-only scrips), we leave the cap as None so
    # the UI shows "—" instead of a fabricated number.
    market_cap_cr = (
        round(last.close * sec.shares_outstanding / 1e7, 1)
        if sec.shares_outstanding
        else None
    )

    # ---- Condition Catalog: event/crossover signal flags (1 = true today) ----
    s50n, s50p = sma_at(closes, 50, 0), sma_at(closes, 50, 1)
    s200n, s200p = sma_at(closes, 200, 0), sma_at(closes, 200, 1)
    s20n, s20p = sma_at(closes, 20, 0), sma_at(closes, 20, 1)

    def _cross_up(fn, fp, sn, sp) -> int:
        return 1 if None not in (fn, fp, sn, sp) and fp <= sp and fn > sn else 0

    def _cross_dn(fn, fp, sn, sp) -> int:
        return 1 if None not in (fn, fp, sn, sp) and fp >= sp and fn < sn else 0

    golden_cross = _cross_up(s50n, s50p, s200n, s200p)
    death_cross = _cross_dn(s50n, s50p, s200n, s200p)
    cross_20_50_up = _cross_up(s20n, s20p, s50n, s50p)
    cross_20_50_down = _cross_dn(s20n, s20p, s50n, s50p)

    new_high_52w = 1 if last.high >= high_52w else 0
    new_low_52w = 1 if last.low <= low_52w else 0

    mh_now, mh_prev = _macd_hist_at(closes, 0), _macd_hist_at(closes, 1)
    macd_bull_cross = 1 if (mh_now is not None and mh_prev is not None and mh_prev <= 0 < mh_now) else 0
    macd_bear_cross = 1 if (mh_now is not None and mh_prev is not None and mh_prev >= 0 > mh_now) else 0

    gap_up = 1 if prev_close and last.open > prev_close * 1.02 else 0
    gap_down = 1 if prev_close and last.open < prev_close * 0.98 else 0
    volume_spike = 1 if rel_vol >= 2 else 0

    return Metrics(
        symbol=sec.symbol,
        name=sec.name,
        exchange=sec.exchange,
        sector=sec.sector,
        close=last.close,
        change_pct=_pct(last.close, prev_close),
        change_abs=round(last.close - prev_close, 2),
        volume=last.volume,
        rel_volume=rel_vol,
        rsi_14=round(rsi(closes, 14), 1),
        macd_hist=macd_hist(closes),
        sma_20=sma20,
        sma_50=sma50,
        sma_200=sma200,
        pct_above_sma20=_pct(last.close, sma20),
        pct_above_sma50=_pct(last.close, sma50),
        pct_above_sma200=_pct(last.close, sma200),
        dist_52w_high_pct=_pct(last.close, high_52w),
        dist_52w_low_pct=_pct(last.close, low_52w),
        dist_sup_d_pct=sup_d,
        dist_res_d_pct=res_d,
        dist_sup_w_pct=sup_w,
        dist_res_w_pct=res_w,
        dist_sup_m_pct=sup_m,
        dist_res_m_pct=res_m,
        atr_pct=atr_pct(candles, 14),
        market_cap_cr=market_cap_cr,
        segment=sec.segment,
        golden_cross=golden_cross,
        death_cross=death_cross,
        cross_20_50_up=cross_20_50_up,
        cross_20_50_down=cross_20_50_down,
        new_high_52w=new_high_52w,
        new_low_52w=new_low_52w,
        macd_bull_cross=macd_bull_cross,
        macd_bear_cross=macd_bear_cross,
        gap_up=gap_up,
        gap_down=gap_down,
        volume_spike=volume_spike,
    )
