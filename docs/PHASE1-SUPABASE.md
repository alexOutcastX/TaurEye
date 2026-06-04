# Phase 1 — Accounts & Cloud Sync (Supabase) — Setup

The app works **without** Supabase (local guest mode). To turn on real accounts +
cloud sync, do this one-time setup. (You create the project — I can't create
accounts on your behalf.)

## 1. Create the project
1. Go to **supabase.com** → sign in → **New project**.
2. Pick a region close to your users (e.g. **Mumbai / ap-south-1**).
3. Set a database password (save it). Wait ~2 min for it to provision.

## 2. Create the schema
1. In the project: **SQL Editor → New query**.
2. Paste the entire contents of **`supabase/schema.sql`** (in this repo) and **Run**.
3. This creates the tables (profiles, watchlists, screens, reports, credit ledger,
   purchases, referrals, devices, ai_jobs), row-level-security policies, and a
   trigger that auto-creates a profile on signup.

## 3. Get your keys
**Project Settings → API**, copy:
- **Project URL** (`https://xxxx.supabase.co`)
- **anon public** key (safe to ship in the client; RLS protects the data)

## 4. Configure the app
Create a `.env` file in the project root (`C:\CLAUDECODE\TaurEye\.env`):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
```
(Already git-ignored via the usual `.env` patterns — never commit real keys.)

## 5. Email settings (auth)
- **Authentication → Providers → Email** is on by default.
- For quick testing you can **disable "Confirm email"** (Authentication → settings)
  so sign-up logs you in immediately; re-enable it for production.
- Optionally enable **Google / Apple** OAuth later.

## 6. Run it
```
npm run dev          # web, with cloud auth active
```
The login screen now does real **Sign in / Create account**; sessions persist;
"Continue without signing in" still works as guest. Rebuild the APK with the same
two `VITE_SUPABASE_*` vars (plus your `VITE_API_BASE`) to enable accounts on mobile.

---

## What's wired now vs. next
- **Now:** Supabase client, email/password auth (sign-in/up + session), profile
  auto-creation, full schema + RLS. App still runs locally with no project.
- **Next (Phase 1b):** migrate watchlists / saved screens / reports to read &
  write from Supabase (currently still local), and move the credit ledger
  server-side (write via a secure function so balances can't be forged).

## Security notes
- The **anon key is meant to be public**; data is protected by **RLS** (each user
  only their own rows). Never expose the **service_role** key in the client.
- Credit writes will be restricted to a server-side function (service role) so a
  client can't mint credits — reads are allowed, writes are not (already reflected
  in the RLS policies).
