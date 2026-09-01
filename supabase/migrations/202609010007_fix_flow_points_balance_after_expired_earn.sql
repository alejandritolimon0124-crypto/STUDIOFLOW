create or replace function public.studio_flow_client_monthly_points_balance(
  p_client_id uuid
)
returns integer
language sql
security definer
set search_path = public
as $$
  with account as (
    select id
    from loyalty_accounts
    where client_id = p_client_id
      and status = 'active'
    limit 1
  ),
  active_earn_window as (
    select min(fpl.occurred_at) as first_active_earn_at
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    where fpl.movement_type = 'earn'
      and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
  )
  select greatest(coalesce(sum(fpl.points), 0), 0)::integer
  from flow_point_ledger fpl
  join account on account.id = fpl.loyalty_account_id
  cross join active_earn_window earn_window
  where earn_window.first_active_earn_at is not null
    and (
      (
        fpl.movement_type = 'earn'
        and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
      )
      or (
        fpl.movement_type in ('spend', 'expire')
        and fpl.occurred_at >= earn_window.first_active_earn_at
      )
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
    select id
    from loyalty_accounts
    where client_id = p_client_id
      and status = 'active'
    limit 1
  ),
  active_earns as (
    select fpl.*
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    where fpl.movement_type = 'earn'
      and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
      and (
        not p_exclusive
        or (p_artist_id is not null and fpl.metadata ->> 'artistId' = p_artist_id::text)
        or (p_studio_id is not null and fpl.metadata ->> 'studioId' = p_studio_id::text)
      )
  ),
  active_earn_window as (
    select min(occurred_at) as first_active_earn_at
    from active_earns
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
        not p_exclusive
        or fpl.metadata ->> 'rewardArtistId' = p_artist_id::text
        or fpl.metadata ->> 'rewardStudioId' = p_studio_id::text
        or fpl.metadata ->> 'artistId' = p_artist_id::text
        or fpl.metadata ->> 'studioId' = p_studio_id::text
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
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select * into v_profile from profiles where id = auth.uid() and status = 'active';
  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select * into v_client
  from clients
  where profile_id = v_profile.id
    and status = 'active'
  limit 1;

  if v_client.id is null then
    raise exception 'Client profile required';
  end if;

  insert into loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)
  values (v_client.id, 0, 0, 'active', now())
  on conflict (client_id) do update
  set status = 'active',
      updated_at = now()
  returning * into v_loyalty_account;

  select min(fpl.occurred_at)
  into v_first_active_earn_at
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and fpl.movement_type = 'earn'
    and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now();

  select
    coalesce(sum(case when fpl.points > 0 then fpl.points else 0 end), 0)::integer,
    abs(coalesce(sum(case when fpl.points < 0 then fpl.points else 0 end), 0))::integer,
    greatest(coalesce(sum(fpl.points), 0), 0)::integer
  into v_earned, v_spent, v_balance
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and v_first_active_earn_at is not null
    and (
      (
        fpl.movement_type = 'earn'
        and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
      )
      or (
        fpl.movement_type in ('spend', 'expire')
        and fpl.occurred_at >= v_first_active_earn_at
      )
      or fpl.movement_type = 'adjust'
    );

  select
    coalesce(sum(fpl.points), 0)::integer,
    min(coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days'))
  into v_expiring_points, v_next_expiration
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and fpl.movement_type = 'earn'
    and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
    and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') <= now() + interval '14 days';

  update loyalty_accounts
  set points_balance = v_balance,
      updated_at = now()
  where id = v_loyalty_account.id;

  return jsonb_build_object(
    'monthlyBalance', v_balance,
    'monthly_balance', v_balance,
    'activeBalance', v_balance,
    'active_balance', v_balance,
    'monthlyEarned', v_earned,
    'monthly_earned', v_earned,
    'activeEarned', v_earned,
    'active_earned', v_earned,
    'monthlySpent', v_spent,
    'monthly_spent', v_spent,
    'activeSpent', v_spent,
    'active_spent', v_spent,
    'validityDays', 90,
    'validity_days', 90,
    'expiringSoonPoints', greatest(coalesce(v_expiring_points, 0), 0),
    'expiring_soon_points', greatest(coalesce(v_expiring_points, 0), 0),
    'nextExpirationAt', v_next_expiration,
    'next_expiration_at', v_next_expiration
  );
end;
$$;

update loyalty_accounts la
set points_balance = public.studio_flow_client_monthly_points_balance(la.client_id),
    updated_at = now()
where la.status = 'active';
