# Self-hosting Supabase for TaurEye (local now → cloud later)

TaurEye uses Supabase for **auth + Postgres (wallet, watchlists, portfolios) +
the credit RPCs**. After the AI decoupling it needs **no Edge Functions**, so a
self-hosted Supabase (Postgres + GoTrue + PostgREST + Studio) covers everything.

The Docker stack you run locally is the **same artifact** you move to your cloud
VM — so "local now, cloud later" is just copying a folder + a DB dump.

> Run this on **your own machine** (Docker needs persistent ports + ~4 GB RAM).

---

## Prerequisites
- Docker + Docker Compose (Docker Desktop on Mac/Windows; `docker` + `docker-compose-plugin` on Linux)
- Git, and ~4 GB free RAM for the stack

## Option A — Supabase CLI (fastest for local dev)
Best when you just want to develop against a local Supabase.

```bash
npm install -g supabase            # or: brew install supabase/tap/supabase
cd /path/to/TaurEye
supabase init                      # creates supabase/config.toml (keep your supabase/*.sql)
supabase start                     # boots the full stack in Docker
```
`supabase start` prints local credentials, e.g.:
```
API URL:      http://127.0.0.1:54321
Studio URL:   http://127.0.0.1:54323
anon key:     eyJ...
service_role: eyJ...
```
Apply the schema (Studio SQL editor at the Studio URL, or psql), **in this order**:
`schema.sql → credits.sql → referrals.sql → subscriptions.sql → harden-grants.sql`.
Then point the app at it (see "Point TaurEye at it").

To stop: `supabase stop`. Data persists between starts.

## Option B — Docker self-host (portable to your cloud) ★ recommended
This is the stack you'll also run in the cloud.

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```
Edit `.env` — at minimum set strong values for:
- `POSTGRES_PASSWORD` — strong random.
- `JWT_SECRET` — 40+ random chars.
- `ANON_KEY` and `SERVICE_ROLE_KEY` — JWTs signed with `JWT_SECRET` (roles `anon`
  / `service_role`). Generate them with the tool on
  https://supabase.com/docs/guides/self-hosting/docker (don't ship the demo keys).
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` — Studio login.
- `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` — `http://localhost:8000` locally.
- `SMTP_*` — your email provider (Brevo/Resend/SES free tier) for auth emails.

Boot it:
```bash
docker compose pull
docker compose up -d
docker compose ps          # all healthy?
```
- **Studio (dashboard):** http://localhost:8000  → SQL editor
- **API/Auth gateway (Kong):** http://localhost:8000

Apply the TaurEye schema in Studio's SQL editor, **in order**:
1. `supabase/schema.sql`
2. `supabase/credits.sql`
3. `supabase/referrals.sql`
4. `supabase/subscriptions.sql`
5. `supabase/harden-grants.sql`

(Or via psql: `docker compose exec db psql -U postgres -d postgres -f - < schema.sql`.)

## Point TaurEye at it
TaurEye reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time
(`src/lib/supabase.ts`). Create a repo-root `.env.local` (gitignored):
```
VITE_DATA_SOURCE=local
VITE_SUPABASE_URL=http://localhost:8000        # CLI: http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
# VITE_OAUTH_PROVIDERS=google                  # only if you wire OAuth
```
Run: `npm run dev` → sign up → confirm `auth.users` + `public.profiles` populate
and the signup-bonus credits appear (the credit economy works with zero Edge
Functions). The diagnostic still applies: `scripts/check-backend.sh`.

## (Optional) OAuth / email
- Email auth works out of the box (configure SMTP for real delivery).
- For Google etc., set the GoTrue provider envs in `.env`
  (`GOTRUE_EXTERNAL_GOOGLE_ENABLED=true`, client id/secret, redirect URI) and add
  `google` to `VITE_OAUTH_PROVIDERS`.

---

## Later: shift to your cloud (same stack)
1. **Provision** a VM (your Oracle Always-Free 24 GB ARM is plenty) with Docker.
2. **Copy** the `supabase/docker` folder + your `.env` to the VM. Set the public
   URLs to your domain and put **HTTPS** in front (Caddy/Traefik/nginx reverse
   proxy → Kong on :8000). Regenerate all secrets for production.
3. **Migrate the data** from local → cloud:
   ```bash
   # local
   docker compose exec db pg_dump -U postgres -Fc postgres > taureye.dump
   # cloud (after compose up)
   docker compose exec -T db pg_restore -U postgres -d postgres --clean < taureye.dump
   ```
4. **Repoint the app:** set the GitHub secrets `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` to the cloud URL + anon key, and rebuild.
5. **Backups:** schedule a nightly `pg_dump` (cron) — self-hosting means DR is
   yours now.

## Notes
- **No Edge Functions needed** — AI is served from the nightly cache; credits use
  the `spend_credits` / `claim_daily` / `my_balance` Postgres RPCs (in
  `credits.sql`), which run natively in self-hosted Postgres.
- **Resource use:** the full stack is ~6 containers (~2–4 GB RAM).
- **Keep secrets out of git** — `.env` and `.env.local` are gitignored; never
  commit JWT_SECRET / service_role.
