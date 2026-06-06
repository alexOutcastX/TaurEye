import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineWidth,
  type Time,
} from "lightweight-charts";
import { api } from "../api/client";
import type { Candle, Metrics } from "../api/types";
import { fmtCap, fmtInt, fmtNum, fmtPct, signClass } from "../lib/format";
import TradingViewChart from "../components/TradingViewChart";
import { detectPatterns, type DetectedPattern } from "../lib/patterns";
import { COSTS, spend } from "../lib/economy";
import { isWatched, onWatchlistChange, toggleWatch } from "../lib/watchlist";
import "./Chart.css";

type TF = "D" | "W" | "M";
const TIMEFRAMES: { key: TF; label: string }[] = [
  { key: "D", label: "Daily" },
  { key: "W", label: "Weekly" },
  { key: "M", label: "Monthly" },
];

// Daily moving averages with distinct colors. Defaults reduce clutter; the rest
// are one click away.
const MAS: { period: number; color: string }[] = [
  { period: 9, color: "#f5c451" },
  { period: 20, color: "#4ea1ff" },
  { period: 50, color: "#a78bfa" },
  { period: 100, color: "#fb923c" },
  { period: 200, color: "#e879f9" },
];
const DEFAULT_ON = new Set([20, 50, 200]);

interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---- timeframe resampling (weekly/monthly are aggregated from the EOD spine) ----
function bucketKey(date: string, tf: TF): string {
  if (tf === "M") return date.slice(0, 7); // YYYY-MM
  // ISO week number
  const d = new Date(date + "T00:00:00Z");
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3); // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((t.getTime() - firstThu.getTime()) / 86400000 -
        3 +
        ((firstThu.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function resample(daily: Candle[], tf: TF): Bar[] {
  if (tf === "D")
    return daily.map((c) => ({
      time: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

  const buckets = new Map<string, Candle[]>();
  for (const c of daily) {
    const k = bucketKey(c.date, tf);
    const arr = buckets.get(k);
    if (arr) arr.push(c);
    else buckets.set(k, [c]);
  }
  const bars: Bar[] = [];
  for (const arr of buckets.values()) {
    bars.push({
      time: arr[arr.length - 1].date,
      open: arr[0].open,
      high: Math.max(...arr.map((c) => c.high)),
      low: Math.min(...arr.map((c) => c.low)),
      close: arr[arr.length - 1].close,
      volume: arr.reduce((s, c) => s + c.volume, 0),
    });
  }
  bars.sort((a, b) => (a.time < b.time ? -1 : 1));
  return bars;
}

function smaLine(bars: Bar[], period: number) {
  const out: { time: Time; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1)
      out.push({ time: bars[i].time as Time, value: +(sum / period).toFixed(2) });
  }
  return out;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function Chart() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const symbol = params.get("symbol") ?? "";
  const name = params.get("name") ?? "";
  const exchange = params.get("exchange") ?? "";

  const [candles, setCandles] = useState<Candle[]>([]);
  const [info, setInfo] = useState<Metrics | null>(null);
  const [source, setSource] = useState<"native" | "tv">("native");
  const [tf, setTf] = useState<TF>("D");
  const [enabled, setEnabled] = useState<Set<number>>(new Set(DEFAULT_ON));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(isWatched(symbol));
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [drawLines, setDrawLines] = useState(false);
  const [ai, setAi] = useState<{ text: string | null; note: string | null }>({ text: null, note: null });
  const [aiBusy, setAiBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const drawSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const maRefs = useRef<Map<number, ISeriesApi<"Line">>>(new Map());

  useEffect(() => setWatched(isWatched(symbol)), [symbol]);
  useEffect(() => onWatchlistChange(() => setWatched(isWatched(symbol))), [symbol]);

  // ---- fetch full daily history ----
  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    api
      .candles(symbol, 5000)
      .then((c) => setCandles(c))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [symbol]);

  // ---- fetch the factual metrics snapshot for the info panel ----
  useEffect(() => {
    if (!symbol) {
      setInfo(null);
      return;
    }
    api.metrics(symbol).then(setInfo).catch(() => setInfo(null));
  }, [symbol]);

  const bars = useMemo(() => resample(candles, tf), [candles, tf]);

  const head = useMemo(() => {
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const first = bars[0];
    return {
      last,
      rangeChg: ((last.close - first.close) / first.close) * 100,
    };
  }, [bars]);

  // ---- create the chart once ----
  useEffect(() => {
    if (!containerRef.current) return;
    const border = cssVar("--border", "#23262d");
    const text = cssVar("--text-muted", "#9aa3b2");
    const up = cssVar("--up", "#26a37b");
    const down = cssVar("--down", "#e0556e");

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.26 } });
    candleRef.current = candle;

    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = vol;

    const maSeries = maRefs.current;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      maSeries.clear();
    };
  }, []);

  // ---- push candle + volume data on data/timeframe change ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candleRef.current || !volRef.current) return;
    if (bars.length < 2) {
      candleRef.current.setData([]);
      volRef.current.setData([]);
      return;
    }
    const up = cssVar("--up", "#26a37b");
    const down = cssVar("--down", "#e0556e");

    candleRef.current.setData(
      bars.map((b) => ({
        time: b.time as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    volRef.current.setData(
      bars.map((b) => ({
        time: b.time as Time,
        value: b.volume,
        color: b.close >= b.open ? `${up}55` : `${down}55`,
      })),
    );
    chart.timeScale().fitContent();
  }, [bars]);

  // ---- sync moving-average line series with the enabled set ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const { period, color } of MAS) {
      const existing = maRefs.current.get(period);
      if (enabled.has(period)) {
        const line =
          existing ??
          chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
        if (!existing) maRefs.current.set(period, line);
        line.setData(bars.length >= period ? smaLine(bars, period) : []);
      } else if (existing) {
        chart.removeSeries(existing);
        maRefs.current.delete(period);
      }
    }
  }, [bars, enabled]);

  // ---- chart pattern recognition (native chart only) ----
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series) return;
    // clear previous overlays
    priceLinesRef.current.forEach((pl) => series.removePriceLine(pl));
    priceLinesRef.current = [];
    drawSeriesRef.current.forEach((s) => chart.removeSeries(s));
    drawSeriesRef.current = [];
    if (markersRef.current) markersRef.current.setMarkers([]);

    if (source !== "native" || bars.length < 30) {
      setPatterns([]);
      return;
    }
    const { patterns, markers, levels, drawings } = detectPatterns(bars);
    setPatterns(patterns);

    // support/resistance always shown as price lines
    priceLinesRef.current = levels.map((lv) =>
      series.createPriceLine({
        price: lv.price,
        color: lv.color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: lv.title,
      }),
    );

    if (drawLines) {
      // draw patterns as line segments (necklines, connectors, trendlines)
      drawSeriesRef.current = drawings.map((d) => {
        const ls = chart.addSeries(LineSeries, {
          color: d.color,
          lineWidth: d.width as LineWidth,
          lineStyle: d.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        ls.setData(d.points.map((p) => ({ time: p.time, value: p.value })));
        return ls;
      });
    } else {
      // default: marker signals
      if (!markersRef.current) markersRef.current = createSeriesMarkers(series, markers);
      else markersRef.current.setMarkers(markers);
    }
  }, [bars, source, drawLines]);

  const toggle = () => {
    if (!symbol) return;
    setWatched(toggleWatch({ symbol, name, exchange }));
  };
  const toggleMA = (period: number) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });

  // reset AI output when the symbol changes
  useEffect(() => setAi({ text: null, note: null }), [symbol]);

  const runAi = async () => {
    if (!symbol || aiBusy) return;
    // credit-gated premium feature (free while economy is disabled)
    if (!spend("ai_analysis", COSTS.aiAnalysis)) {
      setAi({ text: null, note: "Not enough credits." });
      return;
    }
    setAiBusy(true);
    setAi({ text: null, note: null });
    try {
      const res = await api.aiAnalysis(symbol);
      if (res.text) setAi({ text: res.text, note: res.disclaimer });
      else if (!res.configured)
        setAi({ text: null, note: "AI analysis isn't configured yet (add an LLM API key on the server)." });
      else setAi({ text: null, note: res.error ? `AI error: ${res.error}` : "AI returned no text." });
    } catch (e) {
      setAi({ text: null, note: String(e) });
    } finally {
      setAiBusy(false);
    }
  };

  if (!symbol) {
    return (
      <section className="chart">
        <div className="chart-empty">
          <h1>Chart</h1>
          <p>Pick a scrip from the Screener to open its chart.</p>
          <button className="btn-link" onClick={() => nav("/app/screener")}>
            Go to Screener →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="chart">
      <header className="chart-head">
        <div className="chart-title">
          <h1>{symbol}</h1>
          <span className="chart-name">{name}</span>
          {exchange && <span className="chart-exch">{exchange}</span>}
        </div>
        <div className="chart-actions">
          {head && (
            <span className="chart-last">
              ₹{fmtNum(head.last.close)}{" "}
              <span className={`mono ${signClass(head.rangeChg)}`}>
                {fmtPct(head.rangeChg)}
              </span>
              <span className="chart-last-cap"> over range</span>
            </span>
          )}
          <button className="ai-btn" onClick={runAi} disabled={aiBusy}>
            {aiBusy ? "Analyzing…" : "✨ AI Analysis"}
          </button>
          <button className={`watch-btn ${watched ? "on" : ""}`} onClick={toggle}>
            {watched ? "★ Watching" : "☆ Watchlist"}
          </button>
        </div>
      </header>

      <div className="chart-toolbar">
        <div className="tf-group src-group">
          <button
            className={source === "native" ? "active" : ""}
            onClick={() => setSource("native")}
            title="TaurEye chart — our corporate-action-adjusted EOD data"
          >
            TaurEye
          </button>
          <button
            className={source === "tv" ? "active" : ""}
            onClick={() => setSource("tv")}
            title="TradingView chart widget — TradingView's own data (needs internet)"
          >
            TradingView
          </button>
        </div>

        {source === "native" && (
          <>
            <div className="tf-group">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.key}
                  className={tf === t.key ? "active" : ""}
                  onClick={() => setTf(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ma-group">
              <span className="ma-label">MA</span>
              {MAS.map((m) => (
                <button
                  key={m.period}
                  className={`ma-chip ${enabled.has(m.period) ? "on" : ""}`}
                  style={
                    enabled.has(m.period)
                      ? { borderColor: m.color, color: m.color }
                      : undefined
                  }
                  onClick={() => toggleMA(m.period)}
                  title={`${m.period}-period moving average`}
                >
                  <i style={{ background: m.color }} />
                  {m.period}
                </button>
              ))}
            </div>
            <button
              className={`draw-toggle ${drawLines ? "on" : ""}`}
              onClick={() => setDrawLines((v) => !v)}
              title="Draw detected patterns as lines (necklines, connectors, trendlines) instead of marker signals"
            >
              ✏️ {drawLines ? "Drawing on" : "Draw patterns"}
            </button>
          </>
        )}
      </div>

      {loading && <p className="chart-note">Loading candles…</p>}
      {error && <p className="chart-note err">{error}</p>}
      {!loading && !error && bars.length < 2 && (
        <p className="chart-note">Not enough history to plot.</p>
      )}

      <div className="chart-canvas">
        <div
          ref={containerRef}
          className="lw-chart"
          style={{ display: source === "native" ? "block" : "none" }}
        />
        {source === "tv" && (
          <div className="lw-chart">
            <TradingViewChart symbol={symbol} exchange={exchange} />
          </div>
        )}
        {source === "native" && head && (
          <div className="chart-foot">
            <span>{bars.length} bars</span>
            <span>
              Latest volume {fmtInt(head.last.volume)} · {head.last.time}
            </span>
          </div>
        )}
        {source === "tv" && (
          <div className="chart-foot">
            <span>Chart by TradingView · TradingView’s own data</span>
            <span>{exchange}:{symbol}</span>
          </div>
        )}
      </div>

      {source === "native" && patterns.length > 0 && (
        <section className="patterns">
          <h2 className="patterns-title">Patterns detected</h2>
          <div className="pattern-chips">
            {patterns.map((p, i) => (
              <span key={i} className={`pattern-chip ${p.kind}`} title={p.detail ?? ""}>
                {p.label}
              </span>
            ))}
          </div>
          <p className="patterns-note">
            Technical patterns detected from price action — descriptive only, not a
            prediction or recommendation.
          </p>
        </section>
      )}

      {(ai.text || ai.note) && (
        <section className="ai-panel">
          <h2 className="ai-title">✨ AI analysis</h2>
          {ai.text && <p className="ai-text">{ai.text}</p>}
          {ai.note && <p className="ai-note">{ai.note}</p>}
        </section>
      )}

      {info && (
        <section className="stock-info">
          <h2 className="info-title">Key data</h2>
          <div className="info-grid">
            <Stat label="LTP" value={`₹${fmtNum(info.close)}`} />
            <Stat label="% Change (1D)" value={fmtPct(info.change_pct)} cls={signClass(info.change_pct)} />
            <Stat label="Market Cap" value={fmtCap(info.market_cap_cr)} />
            <Stat label="Volume" value={fmtInt(info.volume)} />
            <Stat label="Rel Volume" value={`${fmtNum(info.rel_volume)}x`} />
            <Stat label="RSI (14)" value={fmtNum(info.rsi_14)} />
            <Stat label="% vs SMA 50" value={fmtPct(info.pct_above_sma50)} cls={signClass(info.pct_above_sma50)} />
            <Stat label="% vs SMA 200" value={fmtPct(info.pct_above_sma200)} cls={signClass(info.pct_above_sma200)} />
            <Stat label="From 52w High" value={fmtPct(info.dist_52w_high_pct)} cls={signClass(info.dist_52w_high_pct)} />
            <Stat label="From 52w Low" value={fmtPct(info.dist_52w_low_pct)} cls={signClass(info.dist_52w_low_pct)} />
            <Stat label="ATR %" value={fmtPct(info.atr_pct)} />
            <Stat label="Sector" value={info.sector || "—"} />
            <Stat label="Segment" value={info.segment || "—"} />
            <Stat label="Exchange" value={info.exchange} />
          </div>

          <p className="info-disclaimer">
            <strong>Disclaimer:</strong> This page shows factual end-of-day market
            data and technical indicators for informational and educational
            purposes only. It is <strong>not investment advice</strong> and
            contains no buy/sell recommendations, price targets, or tips. TaurEye
            is <strong>not a SEBI-registered Investment Adviser or Research
            Analyst</strong>. Data is derived from public NSE/BSE end-of-day
            sources, may be delayed or contain errors, and is not for trade
            execution — verify against official exchange sources. Securities
            investments are subject to market risks; past performance and
            indicators do not guarantee future results. Consult a SEBI-registered
            adviser before investing.
          </p>
        </section>
      )}
    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="info-stat">
      <span className="info-stat-label">{label}</span>
      <span className={`info-stat-value ${cls ?? ""}`}>{value}</span>
    </div>
  );
}
