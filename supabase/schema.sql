-- TaurEye — Supabase schema (Phase 1: accounts + cloud sync)
-- Run this in the Supabase SQL editor after creating your project.
-- Row-Level Security ensures each user can only read/write their own rows.
-- Auth (email/password, OAuth, hashing) is handled by Supabase Auth — we never
-- store passwords ourselves.

-- ---------- profiles (1:1 with auth.users) ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  referral_code text unique default substr(md5(random()::text), 1, 8),
  referred_by   uuid references public.profiles(id),
  ads_disabled  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------- watchlists ----------
create table if not exists public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'My Watchlist',
  items      jsonb not null default '[]',          -- array of {symbol,name,exchange}
  updated_at timestamptz not null default now()
);
create index if not exists ix_watchlists_user on public.watchlists(user_id);

-- ---------- saved screens ----------
create table if not exists public.screens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  request_json jsonb not null,                     -- the ScreenRequest
  created_at   timestamptz not null default now()
);
create index if not exists ix_screens_user on public.screens(user_id);

-- ---------- reports ----------
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_reports_user on public.reports(user_id);

-- ---------- credit ledger (append-only) ----------
create table if not exists public.credit_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      integer not null,                     -- + earn / - spend
  reason     text not null,                        -- daily_claim | rewarded_ad | purchase | referral | ai_analysis | no_ad_pack ...
  ref_id     text,
  created_at timestamptz not null default now()
);
create index if not exists ix_credit_txn_user on public.credit_transactions(user_id, created_at desc);

-- ---------- purchases ----------
create table if not exists public.purchases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null,                   -- razorpay | stripe | apple | google
  provider_txn_id text,
  amount          numeric,
  currency        text default 'INR',
  credits         integer not null default 0,
  status          text not null default 'pending', -- pending | completed | refunded | failed
  created_at      timestamptz not null default now()
);
create index if not exists ix_purchases_user on public.purchases(user_id);

-- ---------- referrals ----------
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references auth.users(id) on delete cascade,
  referee_id    uuid not null references auth.users(id) on delete cascade,
  reward_credits integer not null default 0,
  status        text not null default 'pending',   -- pending | qualified | rewarded
  created_at    timestamptz not null default now()
);

-- ---------- devices (push tokens) ----------
create table if not exists public.devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  push_token text not null,
  platform   text,                                 -- web | android | ios
  created_at timestamptz not null default now(),
  unique (user_id, push_token)
);

-- ---------- ai jobs (audit of credit-gated AI runs) ----------
create table if not exists public.ai_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text,
  prompt_type  text,
  status       text not null default 'done',
  cost_credits integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------- balance view (derived from the ledger) ----------
-- security_invoker: the view runs with the QUERYING user's permissions, so the
-- credit_transactions RLS ("own ledger read") applies and a caller sees only
-- their own balance. Without this, the view runs as owner and bypasses RLS,
-- exposing every user's balance (flagged by Supabase's Security Definer linter).
-- Requires Postgres 15+ (all current Supabase projects).
create or replace view public.credit_balances
  with (security_invoker = true) as
  select user_id, coalesce(sum(delta), 0)::int as balance
  from public.credit_transactions group by user_id;

-- ================= Row-Level Security =================
alter table public.profiles            enable row level security;
alter table public.watchlists          enable row level security;
alter table public.screens             enable row level security;
alter table public.reports             enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.purchases           enable row level security;
alter table public.referrals           enable row level security;
alter table public.devices             enable row level security;
alter table public.ai_jobs             enable row level security;

-- profiles: a user sees/edits their own profile
create policy "own profile read"  on public.profiles for select using (auth.uid() = id);
create policy "own profile write" on public.profiles for update using (auth.uid() = id);

-- generic "owner only" policies for the per-user tables
do $$
declare t text;
begin
  foreach t in array array['watchlists','screens','reports','purchases','devices','ai_jobs']
  loop
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id);', t);
    execute format('create policy "own insert" on public.%I for insert with check (auth.uid() = user_id);', t);
    execute format('create policy "own update" on public.%I for update using (auth.uid() = user_id);', t);
    execute format('create policy "own delete" on public.%I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

-- credit_transactions: users may READ their own; writes happen via secure
-- server-side functions / service role only (so balances can't be forged).
create policy "own ledger read" on public.credit_transactions for select using (auth.uid() = user_id);

-- referrals: a user can see rows where they are referrer or referee
create policy "referral read" on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referee_id);

-- ---------- auto-create a profile on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
