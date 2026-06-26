#!/usr/bin/env bash
# Migrate accounts + app data from the OLD Supabase into the self-hosted DB.
#   bash deploy/azure/migrate-supabase.sh "postgresql://postgres:PW@OLD_HOST:5432/postgres"
#
# Migrating auth.users + auth.identities preserves old emails AND bcrypt password
# hashes, so old logins keep working. public.* carries profiles/wallet/etc.
# Prereqs: pg_dump on this box (sudo dnf/apt install postgresql), and the old DB
# reachable from here. Run from deploy/azure on the VM.
set -euo pipefail
OLD="${1:?usage: migrate-supabase.sh <OLD_DB_URL>}"
cd "$(dirname "$0")"

command -v pg_dump >/dev/null || { echo "pg_dump missing — install: sudo dnf install -y postgresql || sudo apt-get install -y postgresql-client"; exit 1; }
DB=$(sudo docker ps -qf name=supabase-db)
[ -z "$DB" ] && { echo "supabase-db container not running"; exit 1; }

echo "==> Dumping auth (users + identities) from old DB..."
pg_dump "$OLD" --data-only --no-owner -t auth.users -t auth.identities > /tmp/auth_data.sql

echo "==> Dumping public.* app data from old DB..."
pg_dump "$OLD" --data-only --no-owner \
  -t public.profiles -t public.credit_transactions -t public.watchlists \
  -t public.screens -t public.referrals -t public.subscriptions \
  -t public.purchases -t public.devices -t public.reports \
  -t public.ai_jobs -t public.credit_products > /tmp/app_data.sql

echo "==> Clearing freshly-created local test users (avoids email collisions)..."
sudo docker exec -i "$DB" psql -U postgres -d postgres -c "truncate auth.users cascade;"

echo "==> Restoring (FK/triggers disabled during the bulk load)..."
cat <(echo "SET session_replication_role=replica;") /tmp/auth_data.sql /tmp/app_data.sql \
    <(echo "SET session_replication_role=DEFAULT;") \
  | sudo docker exec -i "$DB" psql -U postgres -d postgres

echo "==> Done. User count:"
sudo docker exec -i "$DB" psql -U postgres -d postgres -c "select count(*) as users from auth.users;"
echo "Now test an old account login on https://taureye.com"
