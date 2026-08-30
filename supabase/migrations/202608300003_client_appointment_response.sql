alter table appointments
  add column if not exists client_confirmed_at timestamptz;

create or replace function public.studio_flow_client_update_appointment_response(
  p_appointment_id uuid,
  p_action text
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
  v_from_status appointment_status;
  v_next_status appointment_status;
  v_reason text;
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
    and status <> 'archived'
  limit 1;

  if v_client.id is null then
    raise exception 'Client profile required';
  end if;

  select *
  into v_appointment
  from appointments
  where id = p_appointment_id
    and client_id = v_client.id
    and status in ('scheduled', 'disputed')
  for update;

  if v_appointment.id is null then
    raise exception 'Appointment not available for this client';
  end if;

  v_from_status := v_appointment.status;

  if lower(coalesce(p_action, '')) = 'confirm' then
    v_next_status := 'scheduled';
    v_reason := 'client_confirmed_attendance';

    update appointments
    set
      client_confirmed_at = now(),
      updated_at = now()
    where id = v_appointment.id
    returning * into v_appointment;
  elsif lower(coalesce(p_action, '')) = 'cancel' then
    v_next_status := 'cancelled';
    v_reason := 'client_cancelled_attendance';

    update appointments
    set
      status = v_next_status,
      cancelled_at = now(),
      updated_at = now()
    where id = v_appointment.id
    returning * into v_appointment;

    update availability_slots
    set
      status = 'available',
      held_by_profile_id = null,
      held_until = null,
      updated_at = now()
    where id = v_appointment.availability_slot_id
      or (
        artist_id = v_appointment.artist_id
        and (
          (v_appointment.studio_id is null and studio_id is null)
          or studio_id = v_appointment.studio_id
        )
        and (
          (v_appointment.membership_id is null and membership_id is null)
          or membership_id = v_appointment.membership_id
        )
        and starts_at >= v_appointment.starts_at
        and ends_at <= v_appointment.ends_at
        and status = 'booked'
      );
  else
    raise exception 'Unsupported appointment response action';
  end if;

  insert into appointment_status_events (
    appointment_id,
    from_status,
    to_status,
    reason,
    changed_by_profile_id
  )
  values (
    v_appointment.id,
    v_from_status,
    v_next_status,
    v_reason,
    v_profile.id
  );

  return jsonb_build_object(
    'appointment', jsonb_build_object(
      'id', v_appointment.id,
      'clientId', v_appointment.client_id,
      'client_id', v_appointment.client_id,
      'artistId', v_appointment.artist_id,
      'artist_id', v_appointment.artist_id,
      'studioId', v_appointment.studio_id,
      'studio_id', v_appointment.studio_id,
      'membershipId', v_appointment.membership_id,
      'membership_id', v_appointment.membership_id,
      'appointmentStatus', v_appointment.status,
      'appointment_status', v_appointment.status,
      'clientConfirmedAt', v_appointment.client_confirmed_at,
      'client_confirmed_at', v_appointment.client_confirmed_at
    )
  );
end;
$$;

revoke all on function public.studio_flow_client_update_appointment_response(uuid, text) from public;
grant execute on function public.studio_flow_client_update_appointment_response(uuid, text) to authenticated;

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
        'appointmentStatus', appt.status,
        'bookingSource', appt.booking_source,
$old$,
      $new$
        'appointmentStatus', appt.status,
        'clientConfirmedAt', appt.client_confirmed_at,
        'client_confirmed_at', appt.client_confirmed_at,
        'contextName', coalesce(sp.commercial_name, s.name, ap.artistic_name, artist.display_name, 'Agenda'),
        'context_name', coalesce(sp.commercial_name, s.name, ap.artistic_name, artist.display_name, 'Agenda'),
        'bookingSource', appt.booking_source,
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
        'appointmentStatus', appt.status,
        'bookingSource', appt.booking_source,
$old$,
      $new$
        'appointmentStatus', appt.status,
        'clientConfirmedAt', appt.client_confirmed_at,
        'client_confirmed_at', appt.client_confirmed_at,
        'contextName', coalesce(sp.commercial_name, s.name, ap.artistic_name, artist.display_name, 'Agenda'),
        'context_name', coalesce(sp.commercial_name, s.name, ap.artistic_name, artist.display_name, 'Agenda'),
        'bookingSource', appt.booking_source,
$new$
    );

    execute v_definition;
  end if;
end;
$$;
