begin;

-- RLS is the last line of defense even for tables that are normally reached
-- through SECURITY DEFINER RPCs. Tables without an explicit policy remain
-- deny-by-default for anon and authenticated users.
do $$
declare
  target record;
begin
  for target in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', target.schemaname, target.tablename);
    execute format('revoke all privileges on table %I.%I from anon, public', target.schemaname, target.tablename);

    if target.tablename <> 'studio_profiles' then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table %I.%I from authenticated',
        target.schemaname,
        target.tablename
      );
    end if;
  end loop;
end;
$$;

-- This action changes balances and therefore must only work for a completed
-- appointment belonging to the authenticated provider. The idempotency key
-- continues to prevent duplicate awards.
create or replace function public.studio_flow_artist_award_appointment_points(
  p_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile public.profiles%rowtype;
  v_artist public.artists%rowtype;
  v_appointment public.appointments%rowtype;
  v_service public.service_offerings%rowtype;
  v_loyalty_account public.loyalty_accounts%rowtype;
  v_points integer := 0;
  v_idempotency_key text;
  v_can_award boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found';
  end if;

  if v_appointment.status <> 'completed' or v_appointment.completed_at is null then
    raise exception 'Solo se pueden otorgar FlowPoints por citas completadas.';
  end if;

  select * into v_artist
  from public.artists
  where profile_id = v_profile.id
    and id = v_appointment.artist_id
    and status = 'active'
    and archived_at is null;

  v_can_award := v_artist.id is not null;

  if not v_can_award and v_appointment.studio_id is not null then
    select exists (
      select 1
      from public.studios s
      where s.id = v_appointment.studio_id
        and s.owner_profile_id = v_profile.id
        and s.status = 'active'
        and s.archived_at is null
    ) into v_can_award;
  end if;

  if not v_can_award and v_appointment.studio_id is not null then
    select exists (
      select 1
      from public.user_role_assignments assignment
      join public.roles role on role.id = assignment.role_id
      where assignment.profile_id = v_profile.id
        and assignment.studio_id = v_appointment.studio_id
        and assignment.status = 'active'
        and role.code in ('studio_owner', 'studio_manager')
    ) into v_can_award;
  end if;

  if not v_can_award then
    raise exception 'Artist scope does not allow awarding points';
  end if;

  select * into v_service
  from public.service_offerings
  where id = v_appointment.service_offering_id
    and artist_id = v_appointment.artist_id
    and studio_id is not distinct from v_appointment.studio_id;

  v_points := coalesce(v_service.flow_points_awarded, 0);
  if v_service.id is null or v_points <= 0 then
    raise exception 'This service has no Flow Points configured';
  end if;

  insert into public.loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)
  values (v_appointment.client_id, 0, 0, 'active', now())
  on conflict (client_id) do update
  set status = 'active', updated_at = now()
  returning * into v_loyalty_account;

  v_idempotency_key := concat('appointment-points:', v_appointment.id);

  insert into public.flow_point_ledger (
    loyalty_account_id,
    appointment_id,
    movement_type,
    points,
    reason,
    idempotency_key,
    expires_at,
    occurred_at,
    metadata
  ) values (
    v_loyalty_account.id,
    v_appointment.id,
    'earn',
    v_points,
    'appointment_completed',
    v_idempotency_key,
    now() + interval '180 days',
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

  update public.loyalty_accounts
  set points_balance = public.studio_flow_client_monthly_points_balance(v_appointment.client_id),
      updated_at = now()
  where id = v_loyalty_account.id
  returning * into v_loyalty_account;

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

revoke all on function public.studio_flow_artist_award_appointment_points(uuid) from public, anon;
grant execute on function public.studio_flow_artist_award_appointment_points(uuid) to authenticated;

commit;
