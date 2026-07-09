// TaurEye — AI stock REPORT Edge Function (Supabase Edge runtime, Deno).
//
// Bigger sibling of ai-analysis: produces a structured, multi-section factual
// report (markdown) from the data the client supplies — EOD metrics, detected
// patterns, and corporate actions from the published funda/<SYMBOL>.json. It
// describes ONLY supplied data; sections with no data say so instead of
// inventing numbers (SEBI safety).
//
// Credits: charges COSTS.advancedReport (5) via spend_credits() — but only when
// CHARGE_CREDITS=true (same preview gate as ai-analysis; free until flipped).
//
// Deploy:  supabase functions deploy ai-report   (or paste in the dashboard)
// Secrets: reuses ANTHROPIC_API_KEY (already set for ai-analysis).

import { createClient } from "npm:@supabase/supabase-js@2";
import { callLLM, llmConfigured, llmProvider } from "../_shared/llm.ts";

const REPORT_COST = 5; // keep in sync with COSTS.advancedReport in src/lib/economy.ts

const DISCLAIMER =
  "This report is informational and educational only and is NOT investment advice. " +
  "TaurEye does not recommend buying or selling any security. Data is end-of-day " +
  "and may contain errors; verify against official exchange sources.";

const SYSTEM = [
  "You are a factual equity-report writer for an Indian (NSE/BSE) stock screener.",
  "Write a structured markdown report with EXACTLY these sections:",
  "## About — 2-3 sentences on what the company does (business lines, what it",
  "  sells/serves), from your general knowledge ONLY if you are confident you",
  "  know THIS exact company. If not fully certain, write exactly:",
  "  'Company profile not available.' Never guess, never describe a similarly",
  "  named company, and never invent business details.",
  "## Snapshot — name, sector, market cap, price, day change.",
  "## Price & Trend — close vs 20/50/200 DMAs, what the alignment factually indicates.",
  "## Momentum & Volatility — RSI, MACD histogram, ATR%, relative volume.",
  "## 52-Week Context — distance from 52w high/low, where price sits in the range.",
  "## Corporate Actions — list ONLY the actions provided (splits/bonuses/dividends with dates).",
  "  If none are provided, write 'No corporate actions on record in the supplied data.'",
  "## Detected Patterns — list ONLY the chart patterns provided; if none, say none detected.",
  "## Summary — 3-4 factual sentences tying the above together.",
  "Hard rules: use ONLY the numbers supplied — never estimate, recall, or invent",
  "data (no financials, no balance sheet, no promoter data — they are not supplied).",
  "Never give buy/sell/hold advice, price targets, or predictions. Neutral tone.",
  "FORMATTING: plain sentences and '- ' bullet lines only. NEVER use markdown",
  "tables or pipe characters; for key-value facts write '- **Label:** value'.",
  "No horizontal rules ('---'). Use *italics* and **bold** sparingly.",
  "Do not add sections beyond those listed. Keep it under 450 words total.",
].join(" ");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!llmConfigured()) return json({ configured: false, text: null, disclaimer: DISCLAIMER });

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ configured: true, text: null, error: "not_authenticated" }, 401);

  let body: { symbol?: string; facts?: unknown; patterns?: unknown; corpActions?: unknown };
  try { body = await req.json(); } catch { return json({ configured: true, text: null, error: "bad_request" }, 400); }
  const symbol = (body.symbol ?? "").toString().slice(0, 32);
  if (!symbol) return json({ configured: true, text: null, error: "missing_symbol" }, 400);

  const CHARGE = Deno.env.get("CHARGE_CREDITS") === "true";
  if (CHARGE) {
    const { error: spendErr } = await userClient.rpc("spend_credits", { p_reason: "advanced_report", p_cost: REPORT_COST });
    if (spendErr) {
      const insufficient = spendErr.message?.includes("insufficient_credits");
      return json({ configured: true, text: null, error: insufficient ? "insufficient_credits" : spendErr.message }, insufficient ? 402 : 400);
    }
  }

  const admin = createClient(url, service);
  const refund = async () => {
    if (CHARGE) await admin.from("credit_transactions").insert({ user_id: user.id, delta: REPORT_COST, reason: "advanced_report_refund" });
  };

  const facts = body.facts ? JSON.stringify(body.facts).slice(0, 5000) : "(none)";
  const pats = body.patterns ? JSON.stringify(body.patterns).slice(0, 1200) : "(none)";
  const cas = body.corpActions ? JSON.stringify(body.corpActions).slice(0, 2500) : "(none)";
  const result = await callLLM({
    system: SYSTEM,
    user: `Write the report for ${symbol}.\nMETRICS (JSON): ${facts}\nDETECTED PATTERNS (JSON): ${pats}\nCORPORATE ACTIONS (JSON): ${cas}`,
    maxTokens: 1400,
  });
  if (!result.text) {
    await refund();
    return json({ configured: true, text: null, error: result.error ?? "empty_response", disclaimer: DISCLAIMER }, 502);
  }
  console.log(`ai-report ok symbol=${symbol} provider=${llmProvider()}`);
  await admin.from("ai_jobs").insert({ user_id: user.id, symbol, prompt_type: "report", status: "done", cost_credits: REPORT_COST });
  return json({ configured: true, text: result.text, disclaimer: DISCLAIMER });
});
