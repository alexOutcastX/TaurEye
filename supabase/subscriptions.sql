-- TaurEye — Pro subscription scaffolding (run AFTER schema.sql; idempotent).
--
-- DORMANT until Razorpay subscriptions go live: the table + read access exist
-- so the client can ask "is this user Pro?", but rows are written ONLY by the
-- payment webhook (service role). No client write path exists.

create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan            text not null default 'pro',          -- pro | pro_plus
  status          text not null default 'active',       -- active | cancelled | expired
  provider        text,                                  -- razorpay | google | apple
  provider_ref    text,                                  -- subscription/payment id
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index if not exists ix_subs_user on public.subscriptions(user_id, expires_at desc);

alter table public.subscriptions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='subscriptions'
                   and policyname='own subs read') then
    create policy "own subs read" on public.subscriptions
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Single source of truth for entitlement checks (client + Edge Functions).
create or replace function public.is_pro()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subscriptions
    where user_id = auth.uid()
      and status = 'active'
      and expires_at > now()
  );
$$;
