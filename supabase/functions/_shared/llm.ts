// Shared LLM transport for the AI Edge Functions (ai-analysis, ai-report).
//
// Routing is server-side and env-driven, so the client contract never changes:
//   - If OMNIROUTE_URL is set  → route through the self-hosted OmniRoute gateway
//     (https://github.com/diegosouzapw/OmniRoute), an OpenAI-compatible endpoint
//     that fans out across many providers with automatic fallback. This is the
//     "omniroute" path: set model to "auto" and OmniRoute picks/falls back.
//   - Else if ANTHROPIC_API_KEY is set → call Anthropic directly (legacy path).
//   - Else → not configured.
//
// Secrets (supabase secrets set …):
//   OMNIROUTE_URL     e.g. http://omniroute:20128/v1   (the gateway's /v1 base)
//   OMNIROUTE_API_KEY optional bearer token if OmniRoute has REQUIRE_API_KEY=true
//   OMNIROUTE_MODEL   optional, default "auto"  (e.g. "auto/cheap", "cc/claude-haiku-4-5")
//   ANTHROPIC_API_KEY fallback direct-Anthropic key
//   ANTHROPIC_MODEL   optional, default "claude-haiku-4-5"

import Anthropic from "npm:@anthropic-ai/sdk@0";

export interface LlmResult {
  text: string | null;
  error?: string;
  provider: "omniroute" | "anthropic" | "none";
}

export interface LlmCall {
  system: string;
  user: string;
  maxTokens: number;
}

/** Is any LLM backend configured? (OmniRoute preferred, Anthropic fallback.) */
export function llmConfigured(): boolean {
  return !!(Deno.env.get("OMNIROUTE_URL") || Deno.env.get("ANTHROPIC_API_KEY"));
}

/** Which backend a call will use, for logging/audit. */
export function llmProvider(): LlmResult["provider"] {
  if (Deno.env.get("OMNIROUTE_URL")) return "omniroute";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  return "none";
}

export async function callLLM({ system, user, maxTokens }: LlmCall): Promise<LlmResult> {
  const omniUrl = Deno.env.get("OMNIROUTE_URL");
  if (omniUrl) return callOmniRoute(omniUrl, { system, user, maxTokens });

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) return callAnthropic(anthropicKey, { system, user, maxTokens });

  return { text: null, error: "no_llm_configured", provider: "none" };
}

// ---- OmniRoute (OpenAI-compatible chat/completions) ----
async function callOmniRoute(baseUrl: string, { system, user, maxTokens }: LlmCall): Promise<LlmResult> {
  const model = Deno.env.get("OMNIROUTE_MODEL") || "auto";
  const key = Deno.env.get("OMNIROUTE_API_KEY") || "";
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // OmniRoute is OpenAI-compatible; bearer only needed if REQUIRE_API_KEY=true.
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        // Courtesy attribution headers (ignored if unsupported).
        "http-referer": "https://taureye.com",
        "x-title": "TaurEye",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      return { text: null, error: `omniroute_http_${r.status}: ${detail}`, provider: "omniroute" };
    }
    const j = await r.json();
    const text = (j?.choices?.[0]?.message?.content ?? "").toString().trim();
    return { text: text || null, error: text ? undefined : "empty_response", provider: "omniroute" };
  } catch (e) {
    return { text: null, error: `omniroute_fetch: ${String(e).slice(0, 200)}`, provider: "omniroute" };
  }
}

// ---- Anthropic (legacy direct path) ----
async function callAnthropic(apiKey: string, { system, user, maxTokens }: LlmCall): Promise<LlmResult> {
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5";
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    return { text: text || null, error: text ? undefined : "empty_response", provider: "anthropic" };
  } catch (e) {
    return { text: null, error: `anthropic: ${String(e).slice(0, 200)}`, provider: "anthropic" };
  }
}
