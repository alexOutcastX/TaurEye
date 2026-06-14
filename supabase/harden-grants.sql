-- TaurEye — lock down EXECUTE on the SECURITY DEFINER functions.
--
-- Postgres grants EXECUTE to PUBLIC by default, so every function below was
-- reachable by the `anon` (not-signed-in) role through PostgREST /rest/v1/rpc/*.
-- That's what Supabase's "Public Can Execute SECURITY DEFINER Function" linter
-- flags. SECURITY DEFINER functions run as their owner and bypass RLS, so a
-- public-callable one (e.g. current_balance(uuid), which takes ANY user id) can
-- leak other users' data.
--
-- Run this LAST, after schema.sql + credits.sql + referrals.sql +
-- subscriptions.sql. It is idempotent and skips anything not present.
--
-- Note: internal calls are unaffected — a SECURITY DEFINER function calling
-- another runs with the OWNER's privileges, not the caller's, so revoking
-- EXECUTE from clients does not break my_balance()/spend_credits() etc. calling
-- current_balance() internally. Triggers also fire regardless of EXECUTE grants.

-- 1) Internal helpers + trigger functions: not callable from the API at all.
do $$
declare f text;
begin
  foreach f in array array[
    'public.current_balance(uuid)',   -- internal: takes an arbitrary uid
    'public.handle_new_user()',       -- on_auth_user_created trigger (signup bonus)
    'public.rls_auto_enable()'        -- schema bootstrap helper, if present
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

-- 2) Client RPCs: signed-in users only — drop the default public/anon EXECUTE,
--    grant explicitly to `authenticated`. (service_role bypasses grants.)
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_balance()',
    'public.spend_credits(text, integer)',
    'public.claim_daily(integer)',
    'public.claim_referral(text)',
    'public.my_referrals()',
    'public.is_pro()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;
