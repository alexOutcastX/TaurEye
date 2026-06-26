#!/usr/bin/env bash
# Migrate accounts + app data from the OLD Supabase into the self-hosted DB.
#   bash deploy/azure/migrate-supabase.sh "<OLD_DB_URL>"   (use the SESSION POOLER url)
#
# Runs pg_dump/psql INSIDE the supabase-db container so the client version matches
# the PG17 server (no host pg_dump version mismatch). The container reaches the old
# DB over the internet. Migrating auth.users + auth.identities preserves old emails
# AND bcrypt password hashes, so old logins keep working; public schema carries
# profiles / wallet / watchlists / etc.
#
# WARNING: this TRUNCATEs the new auth.users first (deletes test accounts you
# created on Azure) for a clean import. Comment out the truncate to merge instead.
set -euo pipefail
OLD="${1:?usage: migrate-supabase.sh <OLD_DB_URL>}"
cd "$(dirname "$0")"

DB=$(sudo docker ps -qf name=supabase-db)
[ -z "$DB" ] && { echo "supabase-db container not running (run from the VM)"; exit 1; }

echo "==> Sanity: old user count..."
sudo docker exec "$DB" psql "$OLD" -t -c "select count(*) from auth.users;" \
  || { echo "cannot reach old DB from the container"; exit 1; }

echo "==> Dumping auth (users + identities) from old DB..."
sudo docker exec "$DB" pg_dump "$OLD" --data-only --no-owner \
  -t auth.users -t auth.identities > /tmp/auth_data.sql

echo "==> Dumping public schema data from old DB..."
sudo docker exec "$DB" pg_dump "$OLD" --data-only --no-owner --schema=public > /tmp/app_data.sql

echo "==> auth dump: $(wc -l < /tmp/auth_data.sql) lines | public dump: $(wc -l < /tmp/app_data.sql) lines"

echo "==> Clearing freshly-created local test users (avoids email collisions)..."
sudo docker exec -i "$DB" psql -U postgres -d postgres -c "truncate auth.users cascade;"

echo "==> Restoring into self-hosted DB (FK/triggers disabled during load)..."
{ echo "SET session_replication_role=replica;"; cat /tmp/auth_data.sql /tmp/app_data.sql; echo "SET session_replication_role=DEFAULT;"; } \
  | sudo docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=0

echo "==> Done. New user count + latest accounts:"
sudo docker exec -i "$DB" psql -U postgres -d postgres -c \
  "select count(*) as users from auth.users; select email, created_at from auth.users order by created_at desc limit 8;"
echo "Now test an OLD account login on https://taureye.com"
