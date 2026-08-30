alter table appointments
  add column if not exists confirmation_requested_at timestamptz;

do $$
begin
  alter publication supabase_realtime add table appointments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

create or replace function public.studio_flow_artist_request_appointment_confirmations(
  p_scope text default 'artist',
  p_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_updated integer := 0;
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
  into v_artist
  from artists
  where profile_id = v_profile.id
    and status = 'active'
    and archived_at is null
  limit 1;

  if v_artist.id is null then
    raise exception 'Active artist required';
  end if;

  update appointments
  set
    confirmation_requested_at = now(),
    updated_at = now()
  where artist_id = v_artist.id
    and status = 'scheduled'
    and starts_at >= now()
    and (p_date is null or (starts_at at time zone 'America/Mexico_City')::date = p_date);

  get diagnostics v_updated = row_count;

  return jsonb_build_object('updatedCount', v_updated, 'updated_count', v_updated);
end;
$$;

create or replace function public.studio_flow_owner_request_appointment_confirmations(
  p_studio_id uuid,
  p_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_updated integer := 0;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  update appointments
  set
    confirmation_requested_at = now(),
    updated_at = now()
  where studio_id = v_studio_id
    and status = 'scheduled'
    and starts_at >= now()
    and (p_date is null or (starts_at at time zone 'America/Mexico_City')::date = p_date);

  get diagnostics v_updated = row_count;

  return jsonb_build_object('updatedCount', v_updated, 'updated_count', v_updated);
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_get_client_appointments()'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      $old$
        'clientConfirmedAt', appt.client_confirmed_at,
        'client_confirmed_at', appt.client_confirmed_at,
$old$,
      $new$
        'clientConfirmedAt', appt.client_confirmed_at,
        'client_confirmed_at', appt.client_confirmed_at,
        'confirmationRequestedAt', appt.confirmation_requested_at,
        'confirmation_requested_at', appt.confirmation_requested_at,
$new$
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_get_artist_appointments(uuid)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      $old$
        'clientConfirmedAt', appt.client_confirmed_at,
        'client_confirmed_at', appt.client_confirmed_at,
$old$,
      $new$
        'clientConfirmedAt', appt.client_confirmed_at,
        'client_confirmed_at', appt.client_confirmed_at,
        'confirmationRequestedAt', appt.confirmation_requested_at,
        'confirmation_requested_at', appt.confirmation_requested_at,
$new$
    );
    execute v_definition;
  end if;
end;
$$;

revoke all on function public.studio_flow_artist_request_appointment_confirmations(text, date) from public;
revoke all on function public.studio_flow_owner_request_appointment_confirmations(uuid, date) from public;
grant execute on function public.studio_flow_artist_request_appointment_confirmations(text, date) to authenticated;
grant execute on function public.studio_flow_owner_request_appointment_confirmations(uuid, date) to authenticated;
