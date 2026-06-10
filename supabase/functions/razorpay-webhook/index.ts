// TaurEye — Razorpay webhook Edge Function (credits a wallet after payment).
//
// Razorpay one-time payments power the "Buy credits" packs (no recurring billing
// needed for consumable credits). On `payment.captured`, this verifies the HMAC
// signature, then grants credits to the user via the service-role key. The grant
// is idempotent on the Razorpay payment id, so retried webhooks can't double-pay.
//
// Deploy:  supabase functions deploy razorpay-webhook --no-verify-jwt
//          (--no-verify-jwt: Razorpay calls this with its own signature, not a
//           Supabase JWT.)
// Secrets: supabase secrets set RAZORPAY_WEBHOOK_SECRET=...
//
// Razorpay setup: create the payment with notes {user_id, product_id} so this
// function knows whom to credit and which pack was bought.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return json({ error: "not_configured" }, 500);

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (signature !== expected) return json({ error: "bad_signature" }, 401);

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (event.event !== "payment.captured") return json({ ok: true, ignored: event.event });

  const payment = event.payload?.payment?.entity ?? {};
  const paymentId: string = payment.id;
  const notes = payment.notes ?? {};
  const userId: string | undefined = notes.user_id;
  const productId: string | undefined = notes.product_id;
  if (!paymentId || !userId || !productId) {
    return json({ error: "missing_notes" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Idempotency: bail if this payment already granted credits.
  const { data: prior } = await admin
    .from("purchases")
    .select("id")
    .eq("provider", "razorpay")
    .eq("provider_txn_id", paymentId)
    .maybeSingle();
  if (prior) return json({ ok: true, deduped: true });

  const { data: product } = await admin
    .from("credit_products")
    .select("credits, price_inr")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return json({ error: "unknown_product" }, 400);

  await admin.from("purchases").insert({
    user_id: userId,
    provider: "razorpay",
    provider_txn_id: paymentId,
    amount: (payment.amount ?? 0) / 100, // paise → rupees
    currency: payment.currency ?? "INR",
    credits: product.credits,
    status: "completed",
  });

  await admin.from("credit_transactions").insert({
    user_id: userId,
    delta: product.credits,
    reason: "purchase",
    ref_id: paymentId,
  });

  return json({ ok: true, credited: product.credits });
});
