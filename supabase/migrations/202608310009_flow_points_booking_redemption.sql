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
    and archived_at is null
  limit 1;

  if v_client.id is null then
    raise exception 'Active client required';
  end if;

  select * into v_appointment
  from appointments
  where id = p_appointment_id
    and client_id = v_client.id
    and status = 'scheduled';

  if v_appointment.id is null then
    raise exception 'Appointment not available for reward';
  end if;

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

  if v_reward.id is null then
    raise exception 'Active Flow Points reward required';
  end if;

  if not exists (
    select 1
    from promotions p
    where p.promotion_type = 'private_promo'
      and p.name = 'Flow Points'
      and p.status = 'active'
      and (
        (p.scope_type = 'artist' and p.artist_id = v_appointment.artist_id)
        or (p.scope_type = 'studio' and p.studio_id = v_appointment.studio_id)
      )
  ) then
    raise exception 'Flow Points are not active for this profile';
  end if;

  if not exists (
    select 1
    from appointments previous
    where previous.client_id = v_client.id
      and previous.id <> v_appointment.id
      and previous.status = 'completed'
      and (
        previous.artist_id = v_appointment.artist_id
        or (v_appointment.studio_id is not null and previous.studio_id = v_appointment.studio_id)
      )
  ) then
    raise exception 'Flow Points can only be used after one completed visit';
  end if;

  insert into loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)
  values (v_client.id, 0, 0, 'active', now())
  on conflict (client_id) do update
  set status = 'active',
      updated_at = now()
  returning * into v_loyalty_account;

  v_balance := public.studio_flow_client_monthly_points_balance(v_client.id);
  if v_reward.points_cost > v_balance then
    raise exception 'Insufficient Flow Points';
  end if;

  select coalesce(so.price_amount, 0)
  into v_original_amount
  from service_offerings so
  where so.id = v_appointment.service_offering_id;

  v_discount_percent := coalesce((v_reward.metadata ->> 'discountPercent')::integer, 0);
  v_gross_amount := round(v_original_amount * (100 - v_discount_percent) / 100, 2);
  v_platform_fee_amount := round(v_gross_amount * 0.10, 2);
  v_artist_revenue_amount := greatest(v_gross_amount - v_platform_fee_amount, 0);

  insert into reward_redemptions (
    loyalty_account_id,
    reward_id,
    appointment_id,
    points_spent,
    status,
    redeemed_at,
    applied_at,
    updated_at
  )
  values (
    v_loyalty_account.id,
    v_reward.id,
    v_appointment.id,
    v_reward.points_cost,
    'applied',
    now(),
    now(),
    now()
  )
  returning * into v_redemption;

  insert into flow_point_ledger (
    loyalty_account_id,
    reward_redemption_id,
    appointment_id,
    movement_type,
    points,
    reason,
    idempotency_key,
    occurred_at,
    metadata
  )
  values (
    v_loyalty_account.id,
    v_redemption.id,
    v_appointment.id,
    'spend',
    -v_reward.points_cost,
    'reward_redeemed',
    concat('appointment-reward:', v_appointment.id, ':', v_reward.id),
    now(),
    jsonb_build_object('discountPercent', v_discount_percent)
  )
  on conflict (idempotency_key) do nothing;

  insert into appointment_economies (
    appointment_id,
    gross_amount,
    platform_fee_amount,
    artist_revenue_amount,
    studio_revenue_amount,
    currency,
    calculation_status,
    calculation_version,
    updated_at
  )
  values (
    v_appointment.id,
    v_gross_amount,
    v_platform_fee_amount,
    v_artist_revenue_amount,
    null,
    'MXN',
    'quoted',
    'studio-flow-commission-10-flow-points-discount',
    now()
  )
  on conflict (appointment_id) do update
  set gross_amount = excluded.gross_amount,
      platform_fee_amount = excluded.platform_fee_amount,
      artist_revenue_amount = excluded.artist_revenue_amount,
      calculation_version = excluded.calculation_version,
      updated_at = now()
  returning * into v_economy;

  insert into commissions (
    appointment_id,
    appointment_economy_id,
    amount,
    rate,
    currency,
    status,
    updated_at
  )
  values (
    v_appointment.id,
    v_economy.id,
    v_platform_fee_amount,
    0.10,
    'MXN',
    'potential',
    now()
  )
  on conflict (appointment_id) do update
  set appointment_economy_id = excluded.appointment_economy_id,
      amount = excluded.amount,
      updated_at = now();

  update loyalty_accounts
  set points_balance = public.studio_flow_client_monthly_points_balance(v_client.id),
      updated_at = now()
  where id = v_loyalty_account.id;

  return jsonb_build_object(
    'appointment', jsonb_build_object(
      'id', v_appointment.id,
      'clientId', v_appointment.client_id,
      'artistId', v_appointment.artist_id,
      'studioId', v_appointment.studio_id,
      'serviceOfferingId', v_appointment.service_offering_id,
      'startsAt', v_appointment.starts_at,
      'endsAt', v_appointment.ends_at,
      'date', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
      'time', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
      'status', 'Confirmada',
      'appointmentStatus', v_appointment.status
    ),
    'reward', jsonb_build_object(
      'id', v_reward.id,
      'discountPercent', v_discount_percent,
      'pointsCost', v_reward.points_cost
    ),
    'economy', jsonb_build_object(
      'originalAmount', v_original_amount,
      'grossAmount', v_gross_amount,
      'platformFeeAmount', v_platform_fee_amount
    )
  );
end;
$$;

create or replace function public.studio_flow_artist_set_flow_points_enabled(
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_promotion promotions%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  insert into promotions (
    scope_type,
    artist_id,
    created_by_profile_id,
    promotion_type,
    name,
    status,
    starts_at,
    rules,
    updated_at
  )
  values (
    'artist',
    v_artist.id,
    auth.uid(),
    'private_promo',
    'Flow Points',
    case when p_active then 'active' else 'paused' end,
    now(),
    jsonb_build_object('clientRequiresCompletedVisit', true),
    now()
  )
  on conflict do nothing;

  update promotions
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      rules = jsonb_build_object('clientRequiresCompletedVisit', true),
      updated_at = now()
  where id = (
    select p.id
    from promotions p
    where p.scope_type = 'artist'
      and p.artist_id = v_artist.id
      and p.promotion_type = 'private_promo'
      and p.name = 'Flow Points'
    order by p.updated_at desc
    limit 1
  )
  returning * into v_promotion;

  update rewards
  set status = case when p_active then 'active'::reward_status else 'paused'::reward_status end,
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and archived_at is null;

  return public.studio_flow_artist_get_marketing_settings();
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_get_marketing_settings()'::regprocedure)
  into v_definition;
  if v_definition is not null then
    v_definition := replace(
      v_definition,
      '''rewards'', v_rewards,',
      '''rewards'', v_rewards,
    ''flowPointsEnabled'', exists (
      select 1 from promotions p
      where p.scope_type = ''artist''
        and p.artist_id = v_artist.id
        and p.promotion_type = ''private_promo''
        and p.name = ''Flow Points''
        and p.status = ''active''
    ),
    ''flow_points_enabled'', exists (
      select 1 from promotions p
      where p.scope_type = ''artist''
        and p.artist_id = v_artist.id
        and p.promotion_type = ''private_promo''
        and p.name = ''Flow Points''
        and p.status = ''active''
    ),'
    );
    execute v_definition;
  end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure)
  into v_definition;
  if v_definition is not null then
    v_definition := replace(
      v_definition,
      '''active_promotions'', active_promotions,
        ''services'', services,',
      '''active_promotions'', active_promotions,
        ''rewards'', coalesce((
          select jsonb_agg(jsonb_build_object(
            ''id'', r.id,
            ''name'', r.name,
            ''discountPercent'', coalesce((r.metadata ->> ''discountPercent'')::integer, 0),
            ''discount_percent'', coalesce((r.metadata ->> ''discountPercent'')::integer, 0),
            ''pointsCost'', r.points_cost,
            ''points_cost'', r.points_cost,
            ''status'', r.status
          ) order by r.points_cost)
          from rewards r
          where r.status = ''active''
            and r.archived_at is null
            and (
              (r.scope_type = ''artist'' and r.artist_id = artist_id)
              or (r.scope_type = ''studio'' and r.studio_id = studio_id)
            )
        ), ''[]''::jsonb),
        ''services'', services,'
    );
    execute v_definition;
  end if;
end;
$$;

revoke all on function public.studio_flow_client_apply_appointment_reward(uuid, uuid) from public;
revoke all on function public.studio_flow_artist_set_flow_points_enabled(boolean) from public;
grant execute on function public.studio_flow_client_apply_appointment_reward(uuid, uuid) to authenticated;
grant execute on function public.studio_flow_artist_set_flow_points_enabled(boolean) to authenticated;
