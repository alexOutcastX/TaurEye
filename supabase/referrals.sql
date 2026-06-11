-- TaurEye — Referral rewards (run AFTER schema.sql + credits.sql; idempotent).
--
-- Client write path is ONLY claim_referral(): a signed-in user redeems a code
-- once; the function (SECURITY DEFINER) validates and grants both sides'
-- credits server-side, so rewards can't be forged or repeated. Keep amounts in
-- sync with REWARDS in src/lib/economy.ts (referrer 50 / referee 30).

-- Redeem a referral code (caller = the new user / referee).
create or replace function public.claim_referral(p_code text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  ref_row   record;
  already   uuid;
  ref_reward integer := 50;  -- referrer credits (REWARDS.referrer)
  fr_reward  integer := 30;  -- referee credits  (REWARDS.referee)
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  select referred_by into already from profiles where id = uid;
  if already is not null then
    raise exception 'already_referred';
  end if;

  select id into ref_row from profiles
  where lower(referral_code) = lower(trim(p_code)) limit 1;
  if ref_row.id is null then
    raise exception 'invalid_code';
  end if;
  if ref_row.id = uid then
    raise exception 'self_referral';
  end if;

  update profiles set referred_by = ref_row.id where id = uid;

  insert into referrals (referrer_id, referee_id, reward_credits, status)
  values (ref_row.id, uid, ref_reward, 'rewarded');

  insert into credit_transactions (user_id, delta, reason)
  values (ref_row.id, ref_reward, 'referral_reward'),
         (uid,        fr_reward,  'referral_bonus');

  return public.current_balance(uid);
end $$;

-- The caller's referral activity for the Refer page: who joined with their
-- code (display name only — no emails/ids leak) and the credits earned.
create or replace function public.my_referrals()
returns table (display_name text, joined_at timestamptz, reward integer)
language sql stable security definer set search_path = public as $$
  select coalesce(p.display_name, 'Trader'), r.created_at, r.reward_credits
  from referrals r
  join profiles p on p.id = r.referee_id
  where r.referrer_id = auth.uid()
  order by r.created_at desc;
$$;
