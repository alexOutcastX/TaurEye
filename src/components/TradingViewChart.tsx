import { useEffect, useRef, useState } from "react";

// Load TradingView's widget library once (their free embeddable Advanced Chart).
let tvPromise: Promise<void> | null = null;
function loadTradingView(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).TradingView) return Promise.resolve();
  if (!tvPromise) {
    tvPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load TradingView"));
      document.head.appendChild(s);
    });
  }
  return tvPromise;
}

const CONTAINER_ID = "taureye-tv-chart";

type Props = { symbol: string; exchange: string };

/**
 * Embeds TradingView's free Advanced Chart widget for an NSE/BSE scrip. Uses
 * TradingView's own data history and adjustments (not our DB), so it needs an
 * internet connection. Recreated whenever the symbol changes.
 */
export default function TradingViewChart({ symbol, exchange }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    loadTradingView()
      .then(() => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = "";
        const tvSymbol = `${(exchange || "NSE").toUpperCase()}:${symbol}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (window as any).TradingView.widget({
          symbol: tvSymbol,
          interval: "D",
          theme: "dark",
          style: "1",
          locale: "in",
          timezone: "Asia/Kolkata",
          autosize: true,
          hide_side_toolbar: false,
          allow_symbol_change: false,
          container_id: CONTAINER_ID,
        });
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [symbol, exchange]);

  if (error) {
    return (
      <p className="chart-note err">
        Couldn’t load the TradingView chart (needs an internet connection).
      </p>
    );
  }
  return <div id={CONTAINER_ID} ref={ref} style={{ height: "100%", width: "100%" }} />;
}
