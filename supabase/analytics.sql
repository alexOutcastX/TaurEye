-- TaurEye — product analytics (user-account usage tracking).
-- Apply after schema.sql (needs profiles + auth.users). Self-host:
--   sudo docker exec -i supabase-db psql -U postgres -d postgres < supabase/analytics.sql
--
-- Design:
--   * The app INSERTs small events (page views, screen runs, exports, auth
--     events) — RLS lets a signed-in user insert only as themselves, and
--     guests insert with user_id NULL. Nothing here is readable by users.
--   * All READS go through SECURITY DEFINER report functions that first check
--     public.is_admin() — add yourself to app_admins to see the dashboards.

-- ---------- admin allowlist ----------
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies on purpose: only definer functions (below) consult this table.
-- Make yourself an admin (run as postgres / in Studio):
--   insert into public.app_admins (user_id, note)
--   select id, 'owner' from auth.users where email = 'you@example.com';

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.app_admins where user_id = auth.uid()) $$;
grant execute on function public.is_admin() to authenticated;

-- ---------- events ----------
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  session_id  text not null check (char_length(session_id) <= 64),
  event       text not null check (char_length(event) <= 64),
  props       jsonb not null default '{}' check (pg_column_size(props) <= 4096),
  platform    text check (platform in ('web', 'android', 'ios')),
  app_version text check (char_length(app_version) <= 32),
  path        text check (char_length(path) <= 256),
  created_at  timestamptz not null default now()
);
create index if not exists ix_ae_created on public.analytics_events (created_at desc);
create index if not exists ix_ae_event   on public.analytics_events (event, created_at desc);
create index if not exists ix_ae_user    on public.analytics_events (user_id, created_at desc);

alter table public.analytics_events enable row level security;

-- Signed-in users write their own rows; guests write anonymous rows.
drop policy if exists ae_insert_own on public.analytics_events;
create policy ae_insert_own on public.analytics_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ae_insert_anon on public.analytics_events;
create policy ae_insert_anon on public.analytics_events
  for insert to anon with check (user_id is null);
-- Reads: admins only (normal reporting goes via the definer functions).
drop policy if exists ae_admin_read on public.analytics_events;
create policy ae_admin_read on public.analytics_events
  for select to authenticated using (public.is_admin());

grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

-- ---------- reporting functions (admin-gated) ----------
create or replace function public._require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
end $$;

-- Headline numbers for the admin dashboard.
create or replace function public.analytics_overview()
returns table (
  total_users   bigint,
  new_users_7d  bigint,
  dau           bigint,
  wau           bigint,
  mau           bigint,
  events_today  bigint,
  sessions_today bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query select
    (select count(*) from auth.users),
    (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    (select count(distinct user_id) from public.analytics_events
      where created_at >= date_trunc('day', now()) and user_id is not null),
    (select count(distinct user_id) from public.analytics_events
      where created_at >= now() - interval '7 days' and user_id is not null),
    (select count(distinct user_id) from public.analytics_events
      where created_at >= now() - interval '30 days' and user_id is not null),
    (select count(*) from public.analytics_events
      where created_at >= date_trunc('day', now())),
    (select count(distinct session_id) from public.analytics_events
      where created_at >= date_trunc('day', now()));
end $$;

-- Daily actives / sessions / events / signups for the last p_days days.
create or replace function public.analytics_daily(p_days int default 30)
returns table (day date, active_users bigint, sessions bigint, events bigint, signups bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
    select d.day::date,
           coalesce(e.active_users, 0), coalesce(e.sessions, 0), coalesce(e.events, 0),
           coalesce(u.signups, 0)
    from generate_series(date_trunc('day', now())::date - (least(greatest(p_days,1),365) - 1),
                         date_trunc('day', now())::date, '1 day') as d(day)
    left join (
      select created_at::date as day,
             count(distinct user_id) filter (where user_id is not null) as active_users,
             count(distinct session_id) as sessions,
             count(*) as events
      from public.analytics_events
      where created_at >= date_trunc('day', now()) - make_interval(days => least(greatest(p_days,1),365))
      group by 1
    ) e on e.day = d.day
    left join (
      select created_at::date as day, count(*) as signups
      from auth.users
      where created_at >= date_trunc('day', now()) - make_interval(days => least(greatest(p_days,1),365))
      group by 1
    ) u on u.day = d.day
    order by 1;
end $$;

-- Most-used features over the last p_days days.
create or replace function public.analytics_top_events(p_days int default 7)
returns table (event text, hits bigint, users bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
    select e.event, count(*), count(distinct e.user_id) filter (where e.user_id is not null)
    from public.analytics_events e
    where e.created_at >= now() - make_interval(days => least(greatest(p_days,1),365))
    group by 1 order by 2 desc limit 50;
end $$;

-- Per-account detail: who they are, when they joined, how active they are.
create or replace function public.analytics_users(p_limit int default 100)
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  provider     text,
  joined_at    timestamptz,
  last_seen    timestamptz,
  sessions_30d bigint,
  events_30d   bigint,
  top_event    text
) language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
    select u.id, u.email::text, p.display_name,
           coalesce(u.raw_app_meta_data->>'provider', 'email'),
           u.created_at,
           a.last_seen, coalesce(a.sessions_30d, 0), coalesce(a.events_30d, 0), a.top_event
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join lateral (
      select max(e.created_at) as last_seen,
             count(distinct e.session_id) filter (
               where e.created_at >= now() - interval '30 days') as sessions_30d,
             count(*) filter (where e.created_at >= now() - interval '30 days') as events_30d,
             (select e2.event from public.analytics_events e2
                where e2.user_id = u.id and e2.created_at >= now() - interval '30 days'
                group by e2.event order by count(*) desc limit 1) as top_event
      from public.analytics_events e where e.user_id = u.id
    ) a on true
    order by a.last_seen desc nulls last, u.created_at desc
    limit least(greatest(p_limit, 1), 1000);
end $$;

-- Housekeeping: purge raw events older than p_days (admin-only; run ad-hoc or
-- from a cron). Aggregates above always recompute from what's retained.
create or replace function public.analytics_purge(p_days int default 365)
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  perform public._require_admin();
  delete from public.analytics_events
    where created_at < now() - make_interval(days => greatest(p_days, 30));
  get diagnostics n = row_count;
  return n;
end $$;

-- Lock down like harden-grants.sql: no public/anon EXECUTE on definer functions
-- (they all self-check is_admin(), but defense in depth costs nothing).
revoke execute on function public._require_admin() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_admin()',
    'public.analytics_overview()',
    'public.analytics_daily(int)',
    'public.analytics_top_events(int)',
    'public.analytics_users(int)',
    'public.analytics_purge(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
