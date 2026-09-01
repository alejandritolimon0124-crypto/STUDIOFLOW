alter table public.artist_marketing_preferences
add column if not exists point_redemption_scope text not null default 'exclusive';

do $$
begin
  alter table public.artist_marketing_preferences
  add constraint artist_marketing_preferences_point_scope_check
  check (point_redemption_scope in ('exclusive', 'open'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.studio_flow_client_monthly_points_balance(
  p_client_id uuid
)
returns integer
language sql
security definer
set search_path = public
as $$
  select greatest(coalesce(sum(fpl.points), 0), 0)::integer
  from loyalty_accounts la
  join flow_point_ledger fpl on fpl.loyalty_account_id = la.id
  where la.client_id = p_client_id
    and la.status = 'active'
    and (
      fpl.movement_type <> 'earn'
      or coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
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
  with movements as (
    select
      fpl.points,
      fpl.movement_type,
      fpl.metadata
    from loyalty_accounts la
    join flow_point_ledger fpl on fpl.loyalty_account_id = la.id
    where la.client_id = p_client_id
      and la.status = 'active'
      and (
        fpl.movement_type <> 'earn'
        or coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
      )
  )
  select greatest(coalesce(sum(points) filter (
    where not p_exclusive
      or (
        movement_type = 'earn'
        and (
          (p_artist_id is not null and metadata ->> 'artistId' = p_artist_id::text)
          or (p_studio_id is not null and metadata ->> 'studioId' = p_studio_id::text)
        )
      )
      or (
        movement_type <> 'earn'
        and (
          metadata ->> 'rewardArtistId' = p_artist_id::text
          or metadata ->> 'rewardStudioId' = p_studio_id::text
          or metadata ->> 'artistId' = p_artist_id::text
          or metadata ->> 'studioId' = p_studio_id::text
        )
      )
  ), 0), 0)::integer
  from movements;
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

  select
    coalesce(sum(case when fpl.points > 0 then fpl.points else 0 end), 0)::integer,
    abs(coalesce(sum(case when fpl.points < 0 then fpl.points else 0 end), 0))::integer,
    greatest(coalesce(sum(fpl.points), 0), 0)::integer
  into v_earned, v_spent, v_balance
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and (
      fpl.movement_type <> 'earn'
      or coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
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

create or replace function public.studio_flow_artist_get_marketing_settings(
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_preferences artist_marketing_preferences%rowtype;
  v_rewards jsonb;
  v_double_points jsonb;
  v_happy_hour jsonb;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  insert into artist_marketing_preferences (artist_id, updated_at)
  values (v_artist.id, now())
  on conflict (artist_id) do update
  set updated_at = artist_marketing_preferences.updated_at
  returning * into v_preferences;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'discountPercent', coalesce((r.metadata ->> 'discountPercent')::integer, 0),
    'discount_percent', coalesce((r.metadata ->> 'discountPercent')::integer, 0),
    'pointsCost', r.points_cost,
    'points_cost', r.points_cost,
    'status', r.status
  ) order by r.points_cost), '[]'::jsonb)
  into v_rewards
  from rewards r
  where r.scope_type = 'artist'
    and r.artist_id = v_artist.id
    and r.archived_at is null
    and r.status in ('active', 'paused', 'draft');

  select jsonb_build_object('id', p.id, 'type', 'double_points', 'name', 'Puntos dobles', 'status', p.status, 'rules', coalesce(p.rules, '{}'::jsonb))
  into v_double_points
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'double_points'
    and p.status in ('active', 'paused')
  order by p.updated_at desc
  limit 1;

  select jsonb_build_object('id', p.id, 'type', 'happy_hour', 'name', 'Happy Hour', 'status', p.status, 'rules', coalesce(p.rules, '{}'::jsonb))
  into v_happy_hour
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'happy_hour'
    and p.status in ('active', 'paused')
  order by p.updated_at desc
  limit 1;

  return jsonb_build_object(
    'rewards', v_rewards,
    'flowPointsEnabled', v_preferences.flow_points_enabled,
    'flow_points_enabled', v_preferences.flow_points_enabled,
    'flowPointRedemptionScope', v_preferences.point_redemption_scope,
    'flow_point_redemption_scope', v_preferences.point_redemption_scope,
    'lowOccupancy', jsonb_build_object('active', v_preferences.low_occupancy_enabled, 'period', v_preferences.low_occupancy_period, 'threshold', v_preferences.low_occupancy_threshold),
    'low_occupancy', jsonb_build_object('active', v_preferences.low_occupancy_enabled, 'period', v_preferences.low_occupancy_period, 'threshold', v_preferences.low_occupancy_threshold),
    'maintenanceReminderDays', v_preferences.maintenance_reminder_days,
    'maintenance_reminder_days', v_preferences.maintenance_reminder_days,
    'doublePoints', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'double_points', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happyHour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happy_hour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb))
  );
end;
$$;

create or replace function public.studio_flow_artist_set_flow_points_redemption_scope(
  p_scope text,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_scope text := case when p_scope = 'open' then 'open' else 'exclusive' end;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  insert into artist_marketing_preferences (artist_id, point_redemption_scope, updated_at)
  values (v_artist.id, v_scope, now())
  on conflict (artist_id) do update
  set point_redemption_scope = excluded.point_redemption_scope,
      updated_at = now();

  return public.studio_flow_artist_get_marketing_settings(v_artist.id);
end;
$$;

create or replace function public.studio_flow_client_apply_appointment_reward(
  p_appointment_id uuid,
  p_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_appointment appointments%rowtype;
  v_reward rewards%rowtype;
  v_loyalty_account loyalty_accounts%rowtype;
  v_balance integer := 0;
  v_discount_percent integer := 0;
  v_original_amount numeric := 0;
  v_gross_amount numeric := 0;
  v_platform_fee_amount numeric := 0;
  v_artist_revenue_amount numeric := 0;
  v_economy appointment_economies%rowtype;
  v_redemption reward_redemptions%rowtype;
  v_point_scope text := 'exclusive';
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select * into v_profile from profiles where id = auth.uid() and status = 'active';
  if v_profile.id is null then raise exception 'Active profile required'; end if;

  select * into v_client from clients where profile_id = v_profile.id and status = 'active' and archived_at is null limit 1;
  if v_client.id is null then raise exception 'Active client required'; end if;

  select * into v_appointment from appointments where id = p_appointment_id and client_id = v_client.id and status = 'scheduled';
  if v_appointment.id is null then raise exception 'Appointment not available for reward'; end if;

  select * into v_reward
  from rewards
  where id = p_reward_id
    and status = 'active'
    and archived_at is null
    and reward_type = 'discount'
    and (
      (scope_type = 'artist' and artist_id = v_appointment.artist_id)
      or (scope_type = 'studio' and studio_id = v_appointment.studio_id)
    );

  if v_reward.id is null then raise exception 'Active Flow Points reward required'; end if;

  select coalesce(amp.point_redemption_scope, 'exclusive')
  into v_point_scope
  from artist_marketing_preferences amp
  where amp.artist_id = v_appointment.artist_id;

  v_balance := public.studio_flow_client_points_balance_for_reward(
    v_client.id,
    v_appointment.artist_id,
    v_appointment.studio_id,
    v_point_scope <> 'open'
  );

  if v_reward.points_cost > v_balance then
    raise exception 'Insufficient Flow Points';
  end if;

  select coalesce(so.price_amount, 0) into v_original_amount from service_offerings so where so.id = v_appointment.service_offering_id;

  v_discount_percent := coalesce((v_reward.metadata ->> 'discountPercent')::integer, 0);
  v_gross_amount := round(v_original_amount * (100 - v_discount_percent) / 100, 2);
  v_platform_fee_amount := round(v_gross_amount * 0.10, 2);
  v_artist_revenue_amount := greatest(v_gross_amount - v_platform_fee_amount, 0);

  insert into loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)
  values (v_client.id, 0, 0, 'active', now())
  on conflict (client_id) do update set status = 'active', updated_at = now()
  returning * into v_loyalty_account;

  insert into reward_redemptions (loyalty_account_id, reward_id, appointment_id, points_spent, status, redeemed_at, applied_at, updated_at)
  values (v_loyalty_account.id, v_reward.id, v_appointment.id, v_reward.points_cost, 'applied', now(), now(), now())
  returning * into v_redemption;

  insert into flow_point_ledger (loyalty_account_id, reward_redemption_id, appointment_id, movement_type, points, reason, idempotency_key, occurred_at, metadata)
  values (
    v_loyalty_account.id,
    v_redemption.id,
    v_appointment.id,
    'spend',
    -v_reward.points_cost,
    'reward_redeemed',
    concat('appointment-reward:', v_appointment.id, ':', v_reward.id),
    now(),
    jsonb_build_object('discountPercent', v_discount_percent, 'pointRedemptionScope', v_point_scope, 'rewardArtistId', v_appointment.artist_id, 'rewardStudioId', v_appointment.studio_id)
  )
  on conflict (idempotency_key) do nothing;

  insert into appointment_economies (appointment_id, gross_amount, platform_fee_amount, artist_revenue_amount, studio_revenue_amount, currency, calculation_status, calculation_version, updated_at)
  values (v_appointment.id, v_gross_amount, v_platform_fee_amount, v_artist_revenue_amount, null, 'MXN', 'quoted', 'studio-flow-commission-10-flow-points-discount', now())
  on conflict (appointment_id) do update
  set gross_amount = excluded.gross_amount,
      platform_fee_amount = excluded.platform_fee_amount,
      artist_revenue_amount = excluded.artist_revenue_amount,
      calculation_version = excluded.calculation_version,
      updated_at = now()
  returning * into v_economy;

  insert into commissions (appointment_id, appointment_economy_id, amount, rate, currency, status, updated_at)
  values (v_appointment.id, v_economy.id, v_platform_fee_amount, 0.10, 'MXN', 'potential', now())
  on conflict (appointment_id) do update
  set appointment_economy_id = excluded.appointment_economy_id,
      amount = excluded.amount,
      updated_at = now();

  update loyalty_accounts
  set points_balance = public.studio_flow_client_monthly_points_balance(v_client.id),
      updated_at = now()
  where id = v_loyalty_account.id;

  return jsonb_build_object(
    'appointment', jsonb_build_object('id', v_appointment.id, 'clientId', v_appointment.client_id, 'artistId', v_appointment.artist_id, 'studioId', v_appointment.studio_id, 'serviceOfferingId', v_appointment.service_offering_id, 'startsAt', v_appointment.starts_at, 'endsAt', v_appointment.ends_at, 'date', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'), 'time', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'HH24:MI'), 'status', 'Confirmada', 'appointmentStatus', v_appointment.status),
    'reward', jsonb_build_object('id', v_reward.id, 'discountPercent', v_discount_percent, 'pointsCost', v_reward.points_cost, 'pointRedemptionScope', v_point_scope),
    'economy', jsonb_build_object('originalAmount', v_original_amount, 'grossAmount', v_gross_amount, 'platformFeeAmount', v_platform_fee_amount)
  );
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure) into v_definition;
  if v_definition is not null then
    v_definition := replace(v_definition, 'date_trunc(''month'', now()) + interval ''1 month''', 'now() + interval ''90 days''');
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_sync_appointment_commission(uuid)'::regprocedure) into v_definition;
  if v_definition is not null and position('flow-points-discount' in v_definition) > 0 and position('studio_flow_preserve_flow_points_discount' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '  v_gross_amount := coalesce(v_service.price_amount, 0);',
      '  -- studio_flow_preserve_flow_points_discount
  select gross_amount, platform_fee_amount, artist_revenue_amount
  into v_gross_amount, v_platform_fee_amount, v_artist_revenue_amount
  from appointment_economies
  where appointment_id = v_appointment.id
    and calculation_version like ''%flow-points-discount%'';

  if v_gross_amount is null then
    v_gross_amount := coalesce(v_service.price_amount, 0);'
    );
    v_definition := replace(
      v_definition,
      '  v_artist_revenue_amount := greatest(v_gross_amount - v_platform_fee_amount, 0);',
      '    v_artist_revenue_amount := greatest(v_gross_amount - v_platform_fee_amount, 0);
  end if;'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure) into v_definition;
  if v_definition is not null and position('flowPointRedemptionScope' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '''activePromotions'', active_promotions,
        ''active_promotions'', active_promotions,',
      '''activePromotions'', active_promotions,
        ''active_promotions'', active_promotions,
        ''flowPointRedemptionScope'', coalesce((select amp.point_redemption_scope from artist_marketing_preferences amp where amp.artist_id = artist_id), ''exclusive''),
        ''flow_point_redemption_scope'', coalesce((select amp.point_redemption_scope from artist_marketing_preferences amp where amp.artist_id = artist_id), ''exclusive''),'
    );
    execute v_definition;
  end if;
end $$;

revoke all on function public.studio_flow_client_points_balance_for_reward(uuid, uuid, uuid, boolean) from public;
revoke all on function public.studio_flow_artist_set_flow_points_redemption_scope(text, uuid) from public;
grant execute on function public.studio_flow_client_points_balance_for_reward(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.studio_flow_artist_set_flow_points_redemption_scope(text, uuid) to authenticated;
