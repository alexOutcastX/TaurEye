// Local smoke test for the OmniRoute AI path — no Supabase / no auth needed.
//
// It sends the SAME request shape the ai-analysis Edge Function sends
// (supabase/functions/_shared/llm.ts) to a locally-running OmniRoute, so you can
// verify the gateway + routing + your provider config before deploying.
//
// Usage (Node 18+, has global fetch):
//   node scripts/omni-check.mjs
//   OMNIROUTE_URL=http://localhost:20128/v1 OMNIROUTE_MODEL=auto node scripts/omni-check.mjs
//   OMNIROUTE_API_KEY=xxx node scripts/omni-check.mjs      # if REQUIRE_API_KEY=true
//
// Exit 0 = OmniRoute returned non-empty text (the analysis). Exit 1 = failure.

const BASE = (process.env.OMNIROUTE_URL || "http://localhost:20128/v1").replace(/\/+$/, "");
const MODEL = process.env.OMNIROUTE_MODEL || "auto";
const KEY = process.env.OMNIROUTE_API_KEY || "";

// Same system prompt the ai-analysis function uses (kept short here).
const SYSTEM = [
  "You are a factual equity-data explainer for an Indian (NSE/BSE) stock screener.",
  "Describe ONLY what the provided numbers show, in plain English for a retail investor.",
  "Never give buy/sell/hold advice, price targets, or predictions. Under 180 words.",
].join(" ");

const FACTS = { symbol: "RELIANCE", close: 1402.5, change_pct: -1.2, rsi_14: 46, pct_above_sma200: 3.1, market_cap_cr: 1890000 };

const endpoint = `${BASE}/chat/completions`;
console.log(`→ POST ${endpoint}  (model=${MODEL}${KEY ? ", auth=bearer" : ""})`);

const t0 = Date.now();
let r;
try {
  r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
      "http-referer": "https://taureye.com",
      "x-title": "TaurEye",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Explain the factual picture for RELIANCE. Data snapshot (JSON):\n${JSON.stringify(FACTS)}` },
      ],
    }),
  });
} catch (e) {
  console.error(`✗ Could not reach OmniRoute at ${endpoint}`);
  console.error(`  ${e}`);
  console.error("  Is it running?  docker run -d --name omniroute -p 20128:20128 -v omniroute-data:/data diegosouzapw/omniroute:latest");
  process.exit(1);
}

const ms = Date.now() - t0;
if (!r.ok) {
  const body = await r.text().catch(() => "");
  console.error(`✗ HTTP ${r.status} in ${ms}ms`);
  console.error(`  ${body.slice(0, 400)}`);
  if (r.status === 401) console.error("  → 401: OmniRoute has REQUIRE_API_KEY on; pass OMNIROUTE_API_KEY=…");
  process.exit(1);
}

const j = await r.json();
const text = (j?.choices?.[0]?.message?.content ?? "").toString().trim();
const provider = j?.provider || j?.model || r.headers.get("x-omniroute-provider") || "(unknown)";

if (!text) {
  console.error(`✗ Empty response in ${ms}ms — OmniRoute reached a provider but got no text.`);
  console.error(`  raw: ${JSON.stringify(j).slice(0, 400)}`);
  process.exit(1);
}

console.log(`✓ OK in ${ms}ms · routed via: ${provider}`);
const cost = r.headers.get("x-omniroute-cost");
const saved = r.headers.get("x-omniroute-cost-saved");
if (cost) console.log(`  cost: ${cost}${saved ? `  saved: ${saved}` : ""}`);
console.log("\n--- model output ---\n" + text + "\n--------------------");
process.exit(0);
