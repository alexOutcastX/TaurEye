-- TaurEye — Credit economy server functions (Phase 2: secure earn/spend)
--
-- Run this in the Supabase SQL editor AFTER schema.sql. It is idempotent
-- (create-if-not-exists / create-or-replace), so it is safe to re-run.
--
-- Why this file exists: schema.sql gives users READ access to their own ledger
-- (`credit_transactions`) but deliberately has NO client write policy — a
-- balance is money once credits are purchasable, so it must never be writable
-- from the browser. All grants/spends happen through the SECURITY DEFINER
-- functions below (which run with the definer's rights and enforce the rules
-- themselves) or through Edge Functions using the service-role key.
--
-- The amounts here MUST be kept in sync with src/lib/economy.ts (COSTS/REWARDS).

-- ---------- credit packs (the Wallet "Buy credits" cards) ----------
create table if not exists public.credit_products (
  id        text primary key,                 -- 'pack_99'
  credits   integer not null,                 -- credits granted on purchase
  price_inr integer not null,                 -- price in whole rupees
  play_sku  text,                             -- Google Play Billing SKU (kept open)
  active    boolean not null default true,
  sort      integer not null default 0
);

insert into public.credit_products (id, credits, price_inr, sort) values
  ('pack_99',  100, 99,  1),
  ('pack_299', 350, 299, 2),
  ('pack_599', 750, 599, 3)
on conflict (id) do nothing;

alter table public.credit_products enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='credit_products'
                   and policyname='products public read') then
    create policy "products public read" on public.credit_products
      for select using (active);
  end if;
end $$;

-- ---------- balance helper (server-side sum of the ledger) ----------
create or replace function public.current_balance(p_uid uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int
  from public.credit_transactions
  where user_id = p_uid;
$$;

-- Client-callable: my own balance (the view credit_balances also works, but an
-- RPC is convenient and avoids leaking other rows even if a policy regresses).
create or replace function public.my_balance()
returns integer
language sql stable security definer set search_path = public as $$
  select public.current_balance(auth.uid());
$$;

-- ---------- spend (the only client-callable debit path) ----------
-- Atomic: a per-user advisory lock serialises concurrent spends so the balance
-- can never race below zero. Raises 'insufficient_credits' when short.
create or replace function public.spend_credits(p_reason text, p_cost integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  bal integer;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_cost <= 0 then
    return public.current_balance(uid);
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  select public.current_balance(uid) into bal;
  if bal < p_cost then
    raise exception 'insufficient_credits';
  end if;

  insert into public.credit_transactions (user_id, delta, reason)
  values (uid, -p_cost, p_reason);

  return bal - p_cost;
end $$;

-- ---------- daily claim (server-enforced once per UTC day) ----------
create or replace function public.claim_daily(p_amount integer default 5)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  claimed   integer;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  select count(*) into claimed
  from public.credit_transactions
  where user_id = uid
    and reason = 'daily_claim'
    and created_at::date = (now() at time zone 'utc')::date;

  if claimed > 0 then
    raise exception 'already_claimed_today';
  end if;

  insert into public.credit_transactions (user_id, delta, reason)
  values (uid, p_amount, 'daily_claim');

  return public.current_balance(uid);
end $$;

-- ---------- signup bonus (extends the schema.sql new-user trigger) ----------
-- Replaces handle_new_user so a verified signup also seeds the welcome credits.
-- Keep the profile insert identical to schema.sql; only the bonus row is added.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  -- signup bonus — keep in sync with REWARDS.signupBonus
  insert into public.credit_transactions (user_id, delta, reason)
  values (new.id, 50, 'signup_bonus');

  return new;
end $$;

-- Note: rewarded-ad grants and purchase grants are intentionally NOT exposed as
-- client RPCs — they are forgeable. They are written by Edge Functions using the
-- service-role key after verifying an AdMob SSV signature / Razorpay webhook
-- signature respectively (see supabase/functions/).
