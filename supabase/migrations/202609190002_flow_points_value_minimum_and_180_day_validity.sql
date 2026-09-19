begin;

update public.flow_point_ledger
set expires_at = occurred_at + interval '180 days'
where movement_type = 'earn'
  and expires_at is distinct from occurred_at + interval '180 days';

update public.rewards
set points_cost = greatest(points_cost, 1000),
    validity_days = 180,
    updated_at = now()
where reward_type = 'discount'
  and scope_type in ('artist', 'studio')
  and archived_at is null;

create or replace function public.studio_flow_client_monthly_points_balance(p_client_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  with account as (
    select id
    from loyalty_accounts
    where client_id = p_client_id and status = 'active'
    limit 1
  ),
  active_earn_window as (
    select min(fpl.occurred_at) as first_active_earn_at
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    where fpl.movement_type = 'earn'
      and coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days') > now()
  )
  select greatest(coalesce(sum(fpl.points), 0), 0)::integer
  from flow_point_ledger fpl
  join account on account.id = fpl.loyalty_account_id
  cross join active_earn_window earn_window
  where earn_window.first_active_earn_at is not null
    and (
      (fpl.movement_type = 'earn' and coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days') > now())
      or (fpl.movement_type in ('spend', 'expire') and fpl.occurred_at >= earn_window.first_active_earn_at)
      or fpl.movement_type = 'adjust'
    );
$$;

create or replace function public.studio_flow_client_points_balance_for_reward(
  p_client_id uuid,
  p_artist_id uuid default null,
  p_studio_id uuid default null,
  p_exclusive boolean default true
)
returns integer
language sql
security definer
set search_path = public
as $$
  with account as (
    select id from loyalty_accounts
    where client_id = p_client_id and status = 'active'
    limit 1
  ),
  active_earns as (
    select fpl.*
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    where fpl.movement_type = 'earn'
      and coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days') > now()
      and (
        (p_artist_id is not null and p_studio_id is null
          and fpl.metadata ->> 'artistId' = p_artist_id::text
          and nullif(fpl.metadata ->> 'studioId', '') is null)
        or (p_studio_id is not null and fpl.metadata ->> 'studioId' = p_studio_id::text)
      )
  ),
  active_earn_window as (
    select min(occurred_at) as first_active_earn_at from active_earns
  ),
  eligible_spends as (
    select fpl.*
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    cross join active_earn_window earn_window
    where fpl.movement_type in ('spend', 'expire')
      and earn_window.first_active_earn_at is not null
      and fpl.occurred_at >= earn_window.first_active_earn_at
      and (
        (p_artist_id is not null and p_studio_id is null
          and (fpl.metadata ->> 'rewardArtistId' = p_artist_id::text or fpl.metadata ->> 'artistId' = p_artist_id::text)
          and nullif(coalesce(fpl.metadata ->> 'rewardStudioId', fpl.metadata ->> 'studioId'), '') is null)
        or (p_studio_id is not null
          and (fpl.metadata ->> 'rewardStudioId' = p_studio_id::text or fpl.metadata ->> 'studioId' = p_studio_id::text))
      )
  )
  select greatest(
    coalesce((select sum(points) from active_earns), 0)
    + coalesce((select sum(points) from eligible_spends), 0),
    0
  )::integer;
$$;

create or replace function public.studio_flow_client_get_flow_points_balance()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_loyalty_account loyalty_accounts%rowtype;
  v_earned integer := 0;
  v_spent integer := 0;
  v_balance integer := 0;
  v_expiring_points integer := 0;
  v_next_expiration timestamptz := null;
  v_first_active_earn_at timestamptz := null;
begin
  if auth.uid() is null then raise exception 'Auth session required'; end if;
  select * into v_profile from profiles where id = auth.uid() and status = 'active';
  if v_profile.id is null then raise exception 'Active profile required'; end if;
  select * into v_client from clients where profile_id = v_profile.id and status = 'active' limit 1;
  if v_client.id is null then raise exception 'Client profile required'; end if;

  insert into loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)
  values (v_client.id, 0, 0, 'active', now())
  on conflict (client_id) do update set status = 'active', updated_at = now()
  returning * into v_loyalty_account;

  select min(fpl.occurred_at) into v_first_active_earn_at
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and fpl.movement_type = 'earn'
    and coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days') > now();

  select
    coalesce(sum(case when fpl.points > 0 then fpl.points else 0 end), 0)::integer,
    abs(coalesce(sum(case when fpl.points < 0 then fpl.points else 0 end), 0))::integer,
    greatest(coalesce(sum(fpl.points), 0), 0)::integer
  into v_earned, v_spent, v_balance
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and v_first_active_earn_at is not null
    and (
      (fpl.movement_type = 'earn' and coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days') > now())
      or (fpl.movement_type in ('spend', 'expire') and fpl.occurred_at >= v_first_active_earn_at)
      or fpl.movement_type = 'adjust'
    );

  select coalesce(sum(fpl.points), 0)::integer,
    min(coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days'))
  into v_expiring_points, v_next_expiration
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and fpl.movement_type = 'earn'
    and coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days') > now()
    and coalesce(fpl.expires_at, fpl.occurred_at + interval '180 days') <= now() + interval '14 days';

  update loyalty_accounts set points_balance = v_balance, updated_at = now()
  where id = v_loyalty_account.id;

  return jsonb_build_object(
    'monthlyBalance', v_balance, 'monthly_balance', v_balance,
    'activeBalance', v_balance, 'active_balance', v_balance,
    'monthlyEarned', v_earned, 'monthly_earned', v_earned,
    'activeEarned', v_earned, 'active_earned', v_earned,
    'monthlySpent', v_spent, 'monthly_spent', v_spent,
    'activeSpent', v_spent, 'active_spent', v_spent,
    'validityDays', 180, 'validity_days', 180,
    'minimumRedemptionPoints', 1000, 'minimum_redemption_points', 1000,
    'mxnPerPoint', 0.10, 'mxn_per_point', 0.10,
    'balanceMxn', round(v_balance * 0.10, 2), 'balance_mxn', round(v_balance * 0.10, 2),
    'expiringSoonPoints', greatest(coalesce(v_expiring_points, 0), 0),
    'expiring_soon_points', greatest(coalesce(v_expiring_points, 0), 0),
    'nextExpirationAt', v_next_expiration, 'next_expiration_at', v_next_expiration
  );
end;
$$;

create or replace function public.studio_flow_client_redeem_flow_points(
  p_points integer,
  p_artist_id uuid default null,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_loyalty_account loyalty_accounts%rowtype;
  v_points integer := greatest(coalesce(p_points, 0), 0);
  v_balance integer := 0;
  v_redemption flow_point_redemptions%rowtype;
  v_benefit_mxn numeric := 0;
begin
  if auth.uid() is null then raise exception 'Auth session required'; end if;
  if v_points < 1000 then raise exception 'Los beneficios comienzan a partir de 1,000 Flow Points.'; end if;
  if (p_artist_id is null and p_studio_id is null) or (p_artist_id is not null and p_studio_id is not null) then
    raise exception 'Choose one artist or one studio';
  end if;

  select * into v_profile from profiles where id = auth.uid() and status = 'active';
  if v_profile.id is null then raise exception 'Active profile required'; end if;
  select * into v_client from clients where profile_id = v_profile.id and status = 'active' limit 1;
  if v_client.id is null then raise exception 'Client profile required'; end if;

  insert into loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)
  values (v_client.id, 0, 0, 'active', now())
  on conflict (client_id) do update set status = 'active', updated_at = now()
  returning * into v_loyalty_account;

  v_balance := public.studio_flow_client_points_balance_for_reward(v_client.id, p_artist_id, p_studio_id, true);
  if v_points > v_balance then raise exception 'Insufficient Flow Points for this artist or studio'; end if;
  v_benefit_mxn := round(v_points * 0.10, 2);

  insert into flow_point_ledger (loyalty_account_id, movement_type, points, reason, occurred_at, metadata)
  values (v_loyalty_account.id, 'spend', -v_points, 'reward_redeemed', now(),
    jsonb_build_object('artistId', p_artist_id, 'studioId', p_studio_id, 'source', 'client_redemption', 'benefitMxn', v_benefit_mxn));

  insert into flow_point_redemptions (loyalty_account_id, client_id, artist_id, studio_id, points, redeemed_by_profile_id)
  values (v_loyalty_account.id, v_client.id, p_artist_id, p_studio_id, v_points, auth.uid())
  returning * into v_redemption;

  update loyalty_accounts
  set points_balance = public.studio_flow_client_monthly_points_balance(v_client.id), updated_at = now()
  where id = v_loyalty_account.id returning * into v_loyalty_account;

  return jsonb_build_object(
    'redemptionId', v_redemption.id, 'redemption_id', v_redemption.id,
    'pointsRedeemed', v_points, 'points_redeemed', v_points,
    'benefitMxn', v_benefit_mxn, 'benefit_mxn', v_benefit_mxn,
    'monthlyBalance', v_loyalty_account.points_balance, 'monthly_balance', v_loyalty_account.points_balance,
    'activeBalance', v_loyalty_account.points_balance, 'active_balance', v_loyalty_account.points_balance
  );
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure) into definition;
  if position('interval ''90 days''' in definition) = 0 then
    raise exception 'Flow Points award expiry rule was not found';
  end if;
  definition := replace(definition, 'interval ''90 days''', 'interval ''180 days''');
  execute definition;

  select pg_get_functiondef('public.studio_flow_client_apply_appointment_reward(uuid,uuid)'::regprocedure) into definition;
  if position('if v_reward.id is null then raise exception ''Active Flow Points reward required''; end if;' in definition) = 0 then
    raise exception 'Appointment reward validation was not found';
  end if;
  definition := replace(
    definition,
    'if v_reward.id is null then raise exception ''Active Flow Points reward required''; end if;',
    'if v_reward.id is null then raise exception ''Active Flow Points reward required''; end if;
  if v_reward.points_cost < 1000 then raise exception ''Los beneficios comienzan a partir de 1,000 Flow Points.''; end if;'
  );
  execute definition;

  select pg_get_functiondef('public.studio_flow_artist_save_flow_point_reward(integer,integer,uuid)'::regprocedure) into definition;
  definition := replace(definition, 'if v_points <= 0 then', 'if v_points < 1000 then');
  definition := replace(definition, 'raise exception ''Invalid points cost'';', 'raise exception ''El beneficio requiere al menos 1,000 Flow Points.'';');
  definition := replace(definition, E'    31,\n    now()', E'    180,\n    now()');
  execute definition;

  select pg_get_functiondef('public.studio_flow_studio_save_flow_point_reward(integer,integer,uuid)'::regprocedure) into definition;
  definition := replace(definition, 'if coalesce(p_points_cost, 0) <= 0 then', 'if coalesce(p_points_cost, 0) < 1000 then');
  definition := replace(definition, 'raise exception ''Points cost must be greater than zero'';', 'raise exception ''El beneficio requiere al menos 1,000 Flow Points.'';');
  definition := replace(definition, '''active'', 90, jsonb_build_object', '''active'', 180, jsonb_build_object');
  execute definition;
end;
$$;

revoke all on function public.studio_flow_client_monthly_points_balance(uuid) from public, anon, authenticated;
revoke all on function public.studio_flow_client_points_balance_for_reward(uuid,uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.studio_flow_client_get_flow_points_balance() from public, anon;
revoke all on function public.studio_flow_client_redeem_flow_points(integer,uuid,uuid) from public, anon;
grant execute on function public.studio_flow_client_get_flow_points_balance() to authenticated;
grant execute on function public.studio_flow_client_redeem_flow_points(integer,uuid,uuid) to authenticated;

commit;
