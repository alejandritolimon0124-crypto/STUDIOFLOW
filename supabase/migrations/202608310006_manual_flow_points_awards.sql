create table if not exists public.flow_point_redemptions (
  id uuid primary key default gen_random_uuid(),
  loyalty_account_id uuid not null references loyalty_accounts(id),
  client_id uuid not null references clients(id),
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  points integer not null check (points > 0),
  redeemed_by_profile_id uuid references profiles(id),
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint flow_point_redemptions_scope_check check (
    (artist_id is not null and studio_id is null)
    or (studio_id is not null and artist_id is null)
  )
);

create index if not exists flow_point_redemptions_artist_year_idx
on public.flow_point_redemptions (artist_id, redeemed_at);

create index if not exists flow_point_redemptions_studio_year_idx
on public.flow_point_redemptions (studio_id, redeemed_at);

create or replace function public.studio_flow_client_monthly_points_balance(
  p_client_id uuid
)
returns integer
language sql
security definer
set search_path = public, auth
as $$
  select greatest(coalesce(sum(fpl.points), 0), 0)::integer
  from loyalty_accounts la
  join flow_point_ledger fpl on fpl.loyalty_account_id = la.id
  where la.client_id = p_client_id
    and la.status = 'active'
    and fpl.occurred_at >= date_trunc('month', now())
    and fpl.occurred_at < date_trunc('month', now()) + interval '1 month';
$$;

create or replace function public.studio_flow_artist_award_appointment_points(
  p_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_appointment appointments%rowtype;
  v_service service_offerings%rowtype;
  v_loyalty_account loyalty_accounts%rowtype;
  v_points integer := 0;
  v_idempotency_key text;
  v_can_award boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_appointment
  from appointments
  where id = p_appointment_id;

  if v_appointment.id is null then
    raise exception 'Appointment not found';
  end if;

  select *
  into v_artist
  from artists
  where profile_id = v_profile.id
    and id = v_appointment.artist_id
    and status = 'active'
    and archived_at is null;

  v_can_award := v_artist.id is not null;

  if not v_can_award and v_appointment.studio_id is not null then
    select exists (
      select 1
      from studios s
      where s.id = v_appointment.studio_id
        and s.owner_profile_id = v_profile.id
        and s.status = 'active'
        and s.archived_at is null
    )
    into v_can_award;
  end if;

  if not v_can_award then
    raise exception 'Artist scope does not allow awarding points';
  end if;

  select *
  into v_service
  from service_offerings
  where id = v_appointment.service_offering_id;

  v_points := coalesce(v_service.flow_points_awarded, 0);

  if v_points <= 0 then
    raise exception 'This service has no Flow Points configured';
  end if;

  insert into loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)
  values (v_appointment.client_id, 0, 0, 'active', now())
  on conflict (client_id) do update
  set status = 'active',
      updated_at = now()
  returning *
  into v_loyalty_account;

  v_idempotency_key := concat('appointment-points:', v_appointment.id);

  insert into flow_point_ledger (
    loyalty_account_id,
    appointment_id,
    movement_type,
    points,
    reason,
    idempotency_key,
    expires_at,
    occurred_at,
    metadata
  )
  values (
    v_loyalty_account.id,
    v_appointment.id,
    'earn',
    v_points,
    'appointment_completed',
    v_idempotency_key,
    date_trunc('month', now()) + interval '1 month',
    now(),
    jsonb_build_object(
      'awardedByProfileId', auth.uid(),
      'serviceOfferingId', v_service.id,
      'artistId', v_appointment.artist_id,
      'studioId', v_appointment.studio_id,
      'source', 'manual_artist_button'
    )
  )
  on conflict (idempotency_key) do nothing;

  update loyalty_accounts
  set points_balance = public.studio_flow_client_monthly_points_balance(v_appointment.client_id),
      updated_at = now()
  where id = v_loyalty_account.id
  returning *
  into v_loyalty_account;

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'appointment_id', v_appointment.id,
    'clientId', v_appointment.client_id,
    'client_id', v_appointment.client_id,
    'pointsAwarded', v_points,
    'points_awarded', v_points,
    'monthlyBalance', v_loyalty_account.points_balance,
    'monthly_balance', v_loyalty_account.points_balance
  );
end;
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
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_earned integer := 0;
  v_spent integer := 0;
  v_balance integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_client
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
  returning *
  into v_loyalty_account;

  select
    coalesce(sum(case when fpl.points > 0 then fpl.points else 0 end), 0)::integer,
    abs(coalesce(sum(case when fpl.points < 0 then fpl.points else 0 end), 0))::integer,
    greatest(coalesce(sum(fpl.points), 0), 0)::integer
  into v_earned, v_spent, v_balance
  from flow_point_ledger fpl
  where fpl.loyalty_account_id = v_loyalty_account.id
    and fpl.occurred_at >= v_month_start
    and fpl.occurred_at < v_month_end;

  update loyalty_accounts
  set points_balance = v_balance,
      updated_at = now()
  where id = v_loyalty_account.id;

  return jsonb_build_object(
    'monthlyBalance', v_balance,
    'monthly_balance', v_balance,
    'monthlyEarned', v_earned,
    'monthly_earned', v_earned,
    'monthlySpent', v_spent,
    'monthly_spent', v_spent
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
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  if v_points <= 0 then
    raise exception 'Points must be greater than zero';
  end if;

  if (p_artist_id is null and p_studio_id is null) or (p_artist_id is not null and p_studio_id is not null) then
    raise exception 'Choose one artist or one studio';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_client
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
  returning *
  into v_loyalty_account;

  v_balance := public.studio_flow_client_monthly_points_balance(v_client.id);

  if v_points > v_balance then
    raise exception 'Insufficient Flow Points';
  end if;

  insert into flow_point_ledger (
    loyalty_account_id,
    movement_type,
    points,
    reason,
    occurred_at,
    metadata
  )
  values (
    v_loyalty_account.id,
    'spend',
    -v_points,
    'reward_redeemed',
    now(),
    jsonb_build_object(
      'artistId', p_artist_id,
      'studioId', p_studio_id,
      'source', 'client_redemption'
    )
  );

  insert into flow_point_redemptions (
    loyalty_account_id,
    client_id,
    artist_id,
    studio_id,
    points,
    redeemed_by_profile_id
  )
  values (
    v_loyalty_account.id,
    v_client.id,
    p_artist_id,
    p_studio_id,
    v_points,
    auth.uid()
  )
  returning *
  into v_redemption;

  update loyalty_accounts
  set points_balance = public.studio_flow_client_monthly_points_balance(v_client.id),
      updated_at = now()
  where id = v_loyalty_account.id
  returning *
  into v_loyalty_account;

  return jsonb_build_object(
    'redemptionId', v_redemption.id,
    'redemption_id', v_redemption.id,
    'pointsRedeemed', v_points,
    'points_redeemed', v_points,
    'monthlyBalance', v_loyalty_account.points_balance,
    'monthly_balance', v_loyalty_account.points_balance
  );
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_get_client_appointments()'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(v_definition, '''pointsGranted'', 0,', '''pointsGranted'', coalesce((select sum(fpl.points) from flow_point_ledger fpl where fpl.appointment_id = appt.id and fpl.movement_type = ''earn''), 0),');
    v_definition := replace(v_definition, '''riskScore'', ''low''', '''flowPointsAwarded'', coalesce(so.flow_points_awarded, 0), ''riskScore'', ''low''');
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_get_artist_appointments(uuid)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(v_definition, '''pointsGranted'', 0,', '''pointsGranted'', coalesce((select sum(fpl.points) from flow_point_ledger fpl where fpl.appointment_id = appt.id and fpl.movement_type = ''earn''), 0),');
    v_definition := replace(v_definition, '''riskScore'', ''low''', '''flowPointsAwarded'', coalesce(so.flow_points_awarded, 0), ''riskScore'', ''low''');
    execute v_definition;
  end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_admin_get_billing_summary(date,text)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      'coalesce(sum(em.appointment_count) filter (where em.billing_month = v_month_start), 0) as appointment_count
    from studios s',
      'coalesce(sum(em.appointment_count) filter (where em.billing_month = v_month_start), 0) as appointment_count,
      coalesce((
        select sum(fpr.points)
        from flow_point_redemptions fpr
        where fpr.studio_id = s.id
          and fpr.redeemed_at >= date_trunc(''year'', now())
          and fpr.redeemed_at < date_trunc(''year'', now()) + interval ''1 year''
      ), 0) as redeemed_points_year
    from studios s'
    );
    v_definition := replace(
      v_definition,
      'coalesce(sum(em.appointment_count) filter (where em.billing_month = v_month_start), 0) as appointment_count
    from artists a',
      'coalesce(sum(em.appointment_count) filter (where em.billing_month = v_month_start), 0) as appointment_count,
      coalesce((
        select sum(fpr.points)
        from flow_point_redemptions fpr
        where fpr.artist_id = a.id
          and fpr.redeemed_at >= date_trunc(''year'', now())
          and fpr.redeemed_at < date_trunc(''year'', now()) + interval ''1 year''
      ), 0) as redeemed_points_year
    from artists a'
    );
    v_definition := replace(
      v_definition,
      '''appointment_count'', appointment_count,
        ''status'', case',
      '''appointment_count'', appointment_count,
        ''redeemedPointsYear'', redeemed_points_year,
        ''redeemed_points_year'', redeemed_points_year,
        ''status'', case'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_admin_get_billing_history(text,integer)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      'coalesce(sp.phone, owner_profile.phone, '''') as phone
    from studios s',
      'coalesce(sp.phone, owner_profile.phone, '''') as phone,
      coalesce((
        select sum(fpr.points)
        from flow_point_redemptions fpr
        where fpr.studio_id = s.id
          and fpr.redeemed_at >= v_year_start
          and fpr.redeemed_at < v_year_end
      ), 0) as redeemed_points_year
    from studios s'
    );
    v_definition := replace(
      v_definition,
      'coalesce(p.phone, '''') as phone
    from artists a',
      'coalesce(p.phone, '''') as phone,
      coalesce((
        select sum(fpr.points)
        from flow_point_redemptions fpr
        where fpr.artist_id = a.id
          and fpr.redeemed_at >= v_year_start
          and fpr.redeemed_at < v_year_end
      ), 0) as redeemed_points_year
    from artists a'
    );
    v_definition := replace(
      v_definition,
      '''phone'', fe.phone,
        ''months'', coalesce(month_rows.months, ''[]''::jsonb)',
      '''phone'', fe.phone,
        ''redeemedPointsYear'', fe.redeemed_points_year,
        ''redeemed_points_year'', fe.redeemed_points_year,
        ''months'', coalesce(month_rows.months, ''[]''::jsonb)'
    );
    execute v_definition;
  end if;
end;
$$;

revoke all on function public.studio_flow_client_monthly_points_balance(uuid) from public;
revoke all on function public.studio_flow_artist_award_appointment_points(uuid) from public;
revoke all on function public.studio_flow_client_get_flow_points_balance() from public;
revoke all on function public.studio_flow_client_redeem_flow_points(integer, uuid, uuid) from public;

grant execute on function public.studio_flow_client_monthly_points_balance(uuid) to authenticated;
grant execute on function public.studio_flow_artist_award_appointment_points(uuid) to authenticated;
grant execute on function public.studio_flow_client_get_flow_points_balance() to authenticated;
grant execute on function public.studio_flow_client_redeem_flow_points(integer, uuid, uuid) to authenticated;
