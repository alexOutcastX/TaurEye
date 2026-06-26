import type { IndexQuote } from "../api/types";

// Curated TradingView symbols for our indices / forex / depository receipts.
// Best-effort — every headline instrument is correct; if a niche one doesn't
// resolve on TradingView, just edit its entry here (single source of truth).
const TV: Record<string, string> = {
  // ---- Indian indices (NSE / BSE) ----
  NIFTY: "NSE:NIFTY",
  BANKNIFTY: "NSE:BANKNIFTY",
  NIFTYNEXT50: "NSE:NIFTY_NEXT_50",
  NIFTYMIDCAP100: "NSE:NIFTY_MIDCAP_100",
  NIFTYSMLCAP100: "NSE:NIFTY_SMLCAP_100",
  NIFTY500: "NSE:NIFTY_500",
  NIFTYIT: "NSE:CNXIT",
  NIFTYFINSERVICE: "NSE:CNXFINANCE",
  NIFTYAUTO: "NSE:CNXAUTO",
  NIFTYPHARMA: "NSE:CNXPHARMA",
  NIFTYFMCG: "NSE:CNXFMCG",
  NIFTYMETAL: "NSE:CNXMETAL",
  NIFTYENERGY: "NSE:CNXENERGY",
  NIFTYREALTY: "NSE:CNXREALTY",
  NIFTYPSUBANK: "NSE:NIFTY_PSU_BANK",
  NIFTYINFRA: "NSE:CNXINFRA",
  INDIAVIX: "NSE:INDIAVIX",
  SENSEX: "BSE:SENSEX",
  // ---- Global indices ----
  GSPC: "TVC:SPX",
  DJI: "TVC:DJI",
  IXIC: "NASDAQ:IXIC",
  FTSE: "TVC:UKX",
  GDAXI: "TVC:DAX",
  FCHI: "TVC:CAC40",
  STOXX50E: "TVC:SX5E",
  N225: "TVC:NI225",
  HSI: "TVC:HSI",
  SSEC: "SSE:000001",
  KS11: "KRX:KOSPI",
  TWII: "TWSE:TAIEX",
  AXJO: "ASX:XJO",
  GSPTSE: "TSX:TSX",
  BVSP: "BMFBOVESPA:IBOV",
  // ---- Currency (INR cross rates) ----
  USDINR: "FX_IDC:USDINR",
  EURINR: "FX_IDC:EURINR",
  GBPINR: "FX_IDC:GBPINR",
  JPYINR: "FX_IDC:JPYINR",
  AEDINR: "FX_IDC:AEDINR",
  SGDINR: "FX_IDC:SGDINR",
  AUDINR: "FX_IDC:AUDINR",
  CADINR: "FX_IDC:CADINR",
  // ---- Indian ADRs (US-listed) ----
  INFY: "NYSE:INFY",
  WIT: "NYSE:WIT",
  IBN: "NYSE:IBN",
  HDB: "NYSE:HDB",
  RDY: "NYSE:RDY",
  SIFY: "NASDAQ:SIFY",
  MMYT: "NASDAQ:MMYT",
  WNS: "NYSE:WNS",
  RNW: "NASDAQ:RNW",
};

export function tradingViewSymbol(q: Pick<IndexQuote, "key" | "category">): string {
  const hit = TV[q.key];
  if (hit) return hit;
  // Reasonable fallbacks for anything not in the curated table.
  if (q.category === "currency") return `FX_IDC:${q.key}`;
  if (q.category === "depository") return q.key; // a bare US ticker resolves on TV
  if (q.category === "domestic") return `NSE:${q.key}`;
  return q.key;
}

export function tradingViewUrl(q: Pick<IndexQuote, "key" | "category">): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol(q))}`;
}

// Open an external URL: the system browser on native (Capacitor), a new tab on web.
export async function openExternal(url: string): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    }
  } catch {
    /* fall through to web */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
