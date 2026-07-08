# Product analytics (user-account usage)

TaurEye tracks lightweight product events into the self-hosted Supabase and
shows admin-only dashboards in a **separate admin console** at
**`https://taureye.com/admin/`**. The console is its own mini-app
(`admin/` → `npm run build:admin` → `dist-admin/`, served by nginx under
`/admin/` with `noindex`): it is NOT part of the user-facing SPA, has no link
anywhere in the app, and never ships in the mobile OTA bundle. It has its own
email/password sign-in; only accounts in `app_admins` can see data.

## What's collected

Client events from `src/lib/analytics.ts` (batched, fail-soft, no-op without
the cloud backend): `page_view`, `sign_in`, `sign_up`, `sign_out`,
`oauth_start`, `screen_run`, `export`. Each row: user id (or NULL for guests),
session id, event, small JSON props, platform (web/android/ios), path,
timestamp. No IP addresses or device fingerprints are stored.

RLS: users can only INSERT as themselves (guests only as anonymous); nobody
can read raw events except admins. Dashboards read via admin-gated
SECURITY DEFINER RPCs.

## One-time setup on the VM

```bash
cd ~/TaurEye-main && git pull origin main

# 1. apply the schema (idempotent)
sudo docker exec -i supabase-db psql -U postgres -d postgres \
  < supabase/analytics.sql

# 2. make yourself an admin (replace the email)
sudo docker exec -i supabase-db psql -U postgres -d postgres -c \
  "insert into public.app_admins (user_id, note)
     select id, 'owner' from auth.users where email = 'you@example.com'
   on conflict do nothing;"

# 3. rebuild web so the tracker + the /admin/ console ship
cd deploy/azure && sudo docker compose up -d --build web
```

Then open https://taureye.com/admin/ and sign in with the admin account.

## Dashboards

- **Overview** — total users, new (7d), DAU / WAU / MAU, sessions + events today.
- **Daily active users** — 30-day bar chart with hover detail; exportable
  (CSV/Excel/PDF) via the standard Export menu.
- **Top features (7d)** — event counts + unique users.
- **User accounts** — per-account email, provider, joined, last seen,
  sessions/events (30d), top feature; exportable.

## Retention

Raw events keep forever by default. To purge older than N days (admin session,
or as postgres): `select public.analytics_purge(365);`

## Privacy note

Disclose usage analytics in the Privacy Policy before commercial launch, and
route it through the consent banner if you extend collection beyond
service-operation basics (DPDP 2023).
