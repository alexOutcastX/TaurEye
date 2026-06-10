// TaurEye — AI stock analysis Edge Function (Supabase Edge runtime, Deno).
//
// Production is fully static, so the AI feature cannot call a live backend and
// cannot hold an LLM key in the browser. This function is its serverless home:
//   1. verifies the caller's Supabase JWT (the signed-in user),
//   2. spends credits atomically via the spend_credits() RPC (server is the
//      authority — the client must NOT also debit for ai_analysis),
//   3. calls Claude with a strict, factual, SEBI-safe system prompt,
//   4. refunds the credits if the LLM call fails, and audits the run.
//
// Deploy:  supabase functions deploy ai-analysis
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//           injected automatically by the platform.)
//
// Cost: Haiku 4.5 is ~$1/$5 per Mtok → ~₹0.45 per call, far under the 10-credit
// charge. Keep the metered model at Haiku/Sonnet; never Opus on this path.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0";

const AI_COST = 10; // keep in sync with COSTS.aiAnalysis in src/lib/economy.ts
const MODEL = "claude-haiku-4-5";

const DISCLAIMER =
  "AI commentary is informational only and is NOT investment advice. " +
  "TaurEye does not recommend buying or selling any security.";

const SYSTEM = [
  "You are a factual equity-data explainer for an Indian (NSE/BSE) stock screener.",
  "Describe ONLY what the provided numbers show: trend, momentum, valuation context,",
  "and notable indicator readings, in plain English for a retail investor.",
  "Hard rules: never give buy/sell/hold advice, price targets, or predictions;",
  "never imply a recommendation; stay descriptive and neutral; no hype.",
  "Keep it under 180 words. End with the single line:",
  DISCLAIMER,
].join(" ");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ configured: false, text: null, disclaimer: DISCLAIMER });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // User-scoped client: RLS + auth.uid() apply, so spend_credits() debits the
  // caller and only the caller.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ configured: true, text: null, error: "not_authenticated" }, 401);

  let body: { symbol?: string; facts?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ configured: true, text: null, error: "bad_request" }, 400);
  }
  const symbol = (body.symbol ?? "").toString().slice(0, 32);
  if (!symbol) return json({ configured: true, text: null, error: "missing_symbol" }, 400);

  // 1) Charge credits (server is the authority) — only when charging is turned
  // on. During the preview phase CHARGE_CREDITS is unset, so AI runs FREE for
  // signed-in users (no debit). Flip it on later with:
  //   supabase secrets set CHARGE_CREDITS=true
  const CHARGE = Deno.env.get("CHARGE_CREDITS") === "true";
  if (CHARGE) {
    const { error: spendErr } = await userClient.rpc("spend_credits", {
      p_reason: "ai_analysis",
      p_cost: AI_COST,
    });
    if (spendErr) {
      const insufficient = spendErr.message?.includes("insufficient_credits");
      return json(
        { configured: true, text: null, error: insufficient ? "insufficient_credits" : spendErr.message },
        insufficient ? 402 : 400,
      );
    }
  }

  // Service client for refunds + audit (bypasses RLS).
  const admin = createClient(url, service);
  const refund = async () => {
    if (!CHARGE) return;
    await admin.from("credit_transactions").insert({
      user_id: user.id,
      delta: AI_COST,
      reason: "ai_analysis_refund",
    });
  };

  // 2) Call Claude.
  try {
    const anthropic = new Anthropic({ apiKey });
    const facts = body.facts ? JSON.stringify(body.facts).slice(0, 4000) : "(no metrics supplied)";
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Explain the factual picture for ${symbol}. Data snapshot (JSON):\n${facts}`,
        },
      ],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

    if (!text) {
      await refund();
      return json({ configured: true, text: null, error: "empty_response", disclaimer: DISCLAIMER }, 502);
    }

    await admin.from("ai_jobs").insert({
      user_id: user.id,
      symbol,
      prompt_type: "analysis",
      status: "done",
      cost_credits: AI_COST,
    });

    return json({ configured: true, text, disclaimer: DISCLAIMER });
  } catch (e) {
    await refund();
    return json(
      { configured: true, text: null, error: String(e), disclaimer: DISCLAIMER },
      502,
    );
  }
});
