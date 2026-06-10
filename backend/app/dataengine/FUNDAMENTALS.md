# Fundamentals ingestion (data-pipeline-first for the AI report)

The AI report can only be as factual as the data under it — so we ingest real,
publicly-filed fundamentals into the spine **before** building the report UI.
This is Phase 1.

## What's ingested

| Dataset | Table | Source | Status |
|---|---|---|---|
| Corporate actions (splits/bonus/dividends) | `corporate_actions` | NSE (already in the spine) | ✅ reliable today |
| Financial results (revenue, profit, EPS, …) | `financials` | BSE `Comp_FinancialResultData` | ⚠️ validate endpoint on VM |
| Shareholding (promoter %, pledge, FII/DII) | `shareholding` | BSE `ComShpPromoterNGroup` | ⚠️ validate endpoint on VM |
| Filings / order wins / board meetings | `announcements` | BSE `AnnGetData` | ⚠️ validate endpoint on VM |

Keyed by **BSE scrip code** (`securities.bse_code`). NSE-only names without a BSE
listing are skipped in Phase 1 (NSE sources are a later phase).

## ⚠️ One-time validation on the VM (required)

The BSE corporate-API response shapes aren't officially documented and drift, so
the parsers in `funda.py` use defensive alias maps and stash the raw JSON. Before
trusting them, confirm the live shape on the VM (where BSE is reachable):

```bash
cd /opt/taureye && source venv/bin/activate
python -m backend.app.dataengine.run funda-probe RELIANCE
```

That prints the raw financials/shareholding/announcement JSON for one symbol.
Paste a sample back and the parser alias maps (`_FIN_KEYS`, `parse_shareholding`,
`parse_announcements`) get tuned to the real keys. Nothing breaks if a shape is
wrong — unmapped fields are just `NULL`, and `raw` keeps the full payload.

## Run it

```bash
# Fetch fundamentals for the biggest names first (resumable; weekly refresh).
python -m backend.app.dataengine.run funda --limit 50      # smoke test
python -m backend.app.dataengine.run funda                 # all due

# Publish per-symbol files for the report (funda/<SYMBOL>.json).
python -m backend.app.dataengine.run export --funda --gz
```

`funda` is **resumable** (a per-symbol `funda_runs` timestamp), **rate-limited**
(`FUNDA_SLEEP`), and **refreshes weekly** (`FUNDA_MAX_AGE_DAYS`). Add it to the
nightly `deploy/refresh.sh` after the EOD stages, e.g. a nightly slice:
`run funda --limit 800` (covers the universe over a few nights), then
`export --all --funda`.

## What the client gets

`public/data/funda/<SYMBOL>.json`:
```json
{
  "s": "RELIANCE", "n": "Reliance Industries", "sec": "Energy", "isin": "INE002A01018",
  "corporate_actions": [{"ex_date","kind","ratio","detail"}],
  "financials":        [{"period_end","period_type","revenue","net_profit","eps", ...}],
  "shareholding":      [{"period_end","promoter_pct","promoter_pledge_pct","fii_pct","dii_pct"}],
  "announcements":     [{"dt","category","headline","url"}]
}
```
The report Edge Function feeds this **real** data to the model (it never invents
financials) and computes derived metrics (debt/equity, repayment capacity, YoY
growth) from the actuals.

## Roadmap

- **Phase 1 (this):** corporate actions (live) + BSE financials, shareholding, filings.
- **Phase 2:** balance-sheet detail (borrowings, debt schedule) + capex from
  annual filings/XBRL; NSE source for NSE-only names.
- **Phase 3:** earnings-call transcripts — **summarized, never reproduced**
  (copyright); sourcing TBD.
- **Alternative:** a paid fundamentals data vendor gives cleaner, more complete
  coverage than scraping BSE for ~5,800 names — worth costing if scraping proves
  too fragile at scale.

## SEBI / compliance
Only publicly-filed exchange data is ingested. The report stays factual +
descriptive with the standard disclaimer; no advice, targets, or recommendations.
