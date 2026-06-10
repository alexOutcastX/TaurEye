// TaurEye — AdMob rewarded-ad Server-Side Verification (SSV) Edge Function.
//
// Rewarded ads grant credits, so the grant must be verified server-side — never
// trust the client that it watched an ad. Configure this function's URL as the
// SSV callback in the AdMob rewarded ad unit. AdMob calls it (GET) with the
// reward params plus a `signature` + `key_id`; we verify against Google's public
// keys, dedupe on `transaction_id`, then grant credits via the service role.
//
// Deploy:  supabase functions deploy admob-ssv --no-verify-jwt
// AdMob:   pass the signed-in user id as the rewarded ad's `userId` /
//          custom_data so the callback knows whom to credit.
//
// NOTE: signature verification is stubbed (marked TODO) — wire it before going
// live. The dedupe + grant pipeline is complete. Until verification is enabled,
// keep CAPGO/economy off so no real credits are mintable.

import { createClient } from "npm:@supabase/supabase-js@2";

const REWARD = 5; // keep in sync with REWARDS.rewardedAd in src/lib/economy.ts

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// TODO(before launch): fetch + cache https://gstatic.com/admob/reward/verifier-keys.json
// and verify `signature` (last query param) over the rest of the query string
// with the ECDSA public key matching `key_id`. Reject on mismatch.
async function verifyAdMobSignature(_url: URL): Promise<boolean> {
  const enforce = Deno.env.get("ADMOB_SSV_ENFORCE") === "true";
  if (!enforce) return true; // dev: accept until keys are wired
  return false; // fail closed once enforcement is on but verification is unimplemented
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const p = url.searchParams;

  if (!(await verifyAdMobSignature(url))) {
    return json({ error: "bad_signature" }, 401);
  }

  const txnId = p.get("transaction_id");
  const userId = p.get("user_id") ?? p.get("custom_data");
  if (!txnId || !userId) return json({ error: "missing_params" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Dedupe on the AdMob transaction id (a rewarded view fires the callback once;
  // retries reuse the same id).
  const { data: prior } = await admin
    .from("credit_transactions")
    .select("id")
    .eq("reason", "rewarded_ad")
    .eq("ref_id", txnId)
    .maybeSingle();
  if (prior) return json({ ok: true, deduped: true });

  await admin.from("credit_transactions").insert({
    user_id: userId,
    delta: REWARD,
    reason: "rewarded_ad",
    ref_id: txnId,
  });

  return json({ ok: true, credited: REWARD });
});
