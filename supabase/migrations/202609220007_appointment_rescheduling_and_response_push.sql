begin;

alter table public.appointments
  add column if not exists reschedule_count integer not null default 0;

alter table public.appointments
  drop constraint if exists appointments_reschedule_count_check;

alter table public.appointments
  add constraint appointments_reschedule_count_check
  check (reschedule_count between 0 and 2);

do $migration$
declare
  d text;
begin
  select pg_get_functiondef('public.studio_flow_artist_request_appointment_confirmations(text,date,text,uuid)'::regprocedure) into d;
  d := replace(
    d,
    'and appt.status = ''scheduled''',
    E'and appt.status = ''scheduled''\n    and appt.confirmation_requested_at is null'
  );
  execute d;

  select pg_get_functiondef('public.studio_flow_owner_request_appointment_confirmations(uuid,date)'::regprocedure) into d;
  d := replace(
    d,
    'and status = ''scheduled''',
    E'and status = ''scheduled''\n    and confirmation_requested_at is null'
  );
  execute d;
end;
$migration$;

create or replace function public.studio_flow_get_appointment_reschedule_availability(
  p_appointment_id uuid,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_appointment public.appointments%rowtype;
  v_service public.service_offerings%rowtype;
  v_requested_date date;
  v_authorized boolean := false;
  v_slots jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Auth session required'; end if;
  if p_date is null then raise exception 'Selecciona una fecha.'; end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and status = 'scheduled';

  if v_appointment.id is null then raise exception 'La cita ya no esta disponible para reagendar.'; end if;
  if v_appointment.reschedule_count >= 2 then
    raise exception 'Se excedieron los 2 eventos de cambio de agenda permitidos. Comunicate con tu artista o estudio.';
  end if;

  v_authorized := exists (
    select 1 from public.clients c
    where c.id = v_appointment.client_id and c.profile_id = auth.uid() and c.status = 'active'
  ) or exists (
    select 1 from public.artists a
    where a.id = v_appointment.artist_id and a.profile_id = auth.uid() and a.status = 'active'
  ) or exists (
    select 1 from public.studios s
    where s.id = v_appointment.studio_id and s.owner_profile_id = auth.uid() and s.studio_status = 'approved'
  ) or exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.profile_id = auth.uid() and ura.studio_id = v_appointment.studio_id
      and ura.status = 'active' and r.code in ('studio_owner', 'studio_manager')
  );

  if not v_authorized then raise exception 'No tienes permiso para reagendar esta cita.'; end if;

  select * into v_service from public.service_offerings where id = v_appointment.service_offering_id;
  if v_service.id is null then raise exception 'El servicio de la cita ya no esta disponible.'; end if;

  v_requested_date := greatest(p_date, (now() at time zone 'America/Mexico_City')::date);

  with candidates as (
    select slot.*, slot.starts_at + make_interval(mins => v_service.duration_minutes) as candidate_end
    from public.availability_slots slot
    where slot.status = 'available'
      and slot.artist_id = v_appointment.artist_id
      and slot.studio_id is not distinct from v_appointment.studio_id
      and slot.membership_id is not distinct from v_appointment.membership_id
      and slot.starts_at >= now()
      and (slot.starts_at at time zone 'America/Mexico_City')::date = v_requested_date
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', candidate.id,
      'availabilitySlotId', candidate.id,
      'availability_slot_id', candidate.id,
      'availabilitySlotIds', coverage.slot_ids,
      'availability_slot_ids', coverage.slot_ids,
      'startsAt', candidate.starts_at,
      'starts_at', candidate.starts_at,
      'endsAt', candidate.candidate_end,
      'ends_at', candidate.candidate_end,
      'date', to_char(candidate.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
      'time', to_char(candidate.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
      'end', to_char(candidate.candidate_end at time zone 'America/Mexico_City', 'HH24:MI'),
      'durationMinutes', v_service.duration_minutes,
      'duration_minutes', v_service.duration_minutes
    ) order by candidate.starts_at
  ), '[]'::jsonb)
  into v_slots
  from candidates candidate
  cross join lateral (
    select jsonb_agg(ordered.id order by ordered.starts_at) as slot_ids,
      max(ordered.ends_at) as coverage_end,
      coalesce(bool_or(ordered.next_start is not null and ordered.next_start > ordered.ends_at), false) as has_gap
    from (
      select covered.id, covered.starts_at, covered.ends_at,
        lead(covered.starts_at) over (order by covered.starts_at) as next_start
      from public.availability_slots covered
      where covered.status = 'available'
        and covered.artist_id = v_appointment.artist_id
        and covered.schedule_id = candidate.schedule_id
        and covered.studio_id is not distinct from v_appointment.studio_id
        and covered.membership_id is not distinct from v_appointment.membership_id
        and covered.starts_at >= candidate.starts_at
        and covered.starts_at < candidate.candidate_end
      order by covered.starts_at
    ) ordered
  ) coverage
  where coverage.coverage_end >= candidate.candidate_end
    and not coverage.has_gap
    and public.studio_flow_slot_obeys_booking_rules(candidate.id, candidate.candidate_end);

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'appointment_id', v_appointment.id,
    'date', v_requested_date,
    'requestedDate', p_date,
    'requested_date', p_date,
    'rescheduleCount', v_appointment.reschedule_count,
    'reschedule_count', v_appointment.reschedule_count,
    'slots', v_slots
  );
end;
$$;

create or replace function public.studio_flow_reschedule_appointment(
  p_appointment_id uuid,
  p_availability_slot_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_appointment public.appointments%rowtype;
  v_service public.service_offerings%rowtype;
  v_authorized boolean := false;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_coverage_end timestamptz;
  v_has_gap boolean;
  v_slot_count integer;
begin
  if auth.uid() is null then raise exception 'Auth session required'; end if;
  if coalesce(cardinality(p_availability_slot_ids), 0) = 0 then raise exception 'Selecciona un horario disponible.'; end if;

  select * into v_appointment from public.appointments
  where id = p_appointment_id and status = 'scheduled' for update;

  if v_appointment.id is null then raise exception 'La cita ya no esta disponible para reagendar.'; end if;
  if v_appointment.reschedule_count >= 2 then
    raise exception 'Se excedieron los 2 eventos de cambio de agenda permitidos. Comunicate con tu artista o estudio.';
  end if;

  v_authorized := exists (
    select 1 from public.clients c where c.id = v_appointment.client_id and c.profile_id = auth.uid() and c.status = 'active'
  ) or exists (
    select 1 from public.artists a where a.id = v_appointment.artist_id and a.profile_id = auth.uid() and a.status = 'active'
  ) or exists (
    select 1 from public.studios s where s.id = v_appointment.studio_id and s.owner_profile_id = auth.uid() and s.studio_status = 'approved'
  ) or exists (
    select 1 from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
    where ura.profile_id = auth.uid() and ura.studio_id = v_appointment.studio_id
      and ura.status = 'active' and r.code in ('studio_owner', 'studio_manager')
  );
  if not v_authorized then raise exception 'No tienes permiso para reagendar esta cita.'; end if;

  select * into v_service from public.service_offerings where id = v_appointment.service_offering_id;
  if v_service.id is null then raise exception 'El servicio de la cita ya no esta disponible.'; end if;

  perform 1 from public.availability_slots where id = any(p_availability_slot_ids) for update;

  select count(*), min(starts_at), max(ends_at),
    coalesce(bool_or(next_start is not null and next_start > ends_at), false)
  into v_slot_count, v_new_start, v_coverage_end, v_has_gap
  from (
    select slot.*, lead(slot.starts_at) over (order by slot.starts_at) as next_start
    from public.availability_slots slot
    where slot.id = any(p_availability_slot_ids)
      and slot.status = 'available'
      and slot.artist_id = v_appointment.artist_id
      and slot.studio_id is not distinct from v_appointment.studio_id
      and slot.membership_id is not distinct from v_appointment.membership_id
  ) selected;

  v_new_end := v_new_start + make_interval(mins => v_service.duration_minutes);
  if v_slot_count <> cardinality(p_availability_slot_ids)
    or v_new_start is null or v_new_start < now()
    or v_coverage_end < v_new_end or v_has_gap
    or not public.studio_flow_slot_obeys_booking_rules(p_availability_slot_ids[1], v_new_end)
  then
    raise exception 'El horario seleccionado ya no esta disponible.';
  end if;

  update public.availability_slots
  set status = 'available', held_by_profile_id = null, held_until = null, updated_at = now()
  where artist_id = v_appointment.artist_id
    and studio_id is not distinct from v_appointment.studio_id
    and membership_id is not distinct from v_appointment.membership_id
    and starts_at >= v_appointment.starts_at and ends_at <= v_appointment.ends_at
    and status = 'booked';

  update public.availability_slots
  set status = 'booked', held_by_profile_id = null, held_until = null, updated_at = now()
  where id = any(p_availability_slot_ids);

  update public.appointments
  set availability_slot_id = p_availability_slot_ids[1], starts_at = v_new_start, ends_at = v_new_end,
    reschedule_count = reschedule_count + 1,
    confirmation_requested_at = null, client_confirmed_at = null, updated_at = now()
  where id = v_appointment.id
  returning * into v_appointment;

  insert into public.appointment_status_events(appointment_id, from_status, to_status, reason, changed_by_profile_id)
  values(v_appointment.id, 'scheduled', 'scheduled', 'appointment_rescheduled', auth.uid());

  return jsonb_build_object('appointmentId', v_appointment.id, 'appointment_id', v_appointment.id,
    'startsAt', v_appointment.starts_at, 'starts_at', v_appointment.starts_at,
    'endsAt', v_appointment.ends_at, 'ends_at', v_appointment.ends_at,
    'rescheduleCount', v_appointment.reschedule_count, 'reschedule_count', v_appointment.reschedule_count);
end;
$$;

create or replace function public.studio_flow_queue_appointment_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_service_name text;
  v_when text;
  v_profile_id uuid;
begin
  select coalesce(c.display_name, 'Una clienta') into v_client_name from public.clients c where c.id = new.client_id;
  select so.name into v_service_name from public.service_offerings so where so.id = new.service_offering_id;
  v_when := to_char(new.starts_at at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI');

  if tg_op = 'INSERT' and new.status = 'scheduled' and new.booking_source in ('client_portal', 'marketplace', 'google') then
    select a.profile_id into v_profile_id from public.artists a where a.id = new.artist_id and a.status = 'active' and a.archived_at is null;
    perform public.studio_flow_enqueue_push_notification(v_profile_id, 'new_appointment', 'Nueva cita en Studio Flow',
      format('%s reservó %s para el %s.', coalesce(v_client_name, 'Una clienta'), coalesce(v_service_name, 'un servicio'), v_when),
      '/artist/appointments', 'appointment-' || new.id, jsonb_build_object('appointmentId', new.id),
      format('appointment:new:%s:artist:%s', new.id, coalesce(v_profile_id::text, 'none')));
  end if;

  if new.studio_id is not null and (
    tg_op = 'INSERT' and new.status = 'scheduled' and new.booking_source in ('client_portal', 'marketplace', 'google')
    or tg_op = 'UPDATE' and (new.client_confirmed_at is distinct from old.client_confirmed_at or new.status is distinct from old.status or new.starts_at is distinct from old.starts_at)
  ) then
    for v_profile_id in select distinct s.owner_profile_id from public.studios s where s.id = new.studio_id and s.studio_status = 'approved' and s.archived_at is null
    loop
      if v_profile_id is distinct from auth.uid() then
        perform public.studio_flow_enqueue_push_notification(v_profile_id, 'studio_appointment_update',
          case when tg_op = 'INSERT' then 'Nueva cita para tu estudio' when new.status = 'cancelled' then 'La clienta canceló su cita' when new.starts_at is distinct from old.starts_at then 'Cita reagendada' else 'Cita confirmada' end,
          format('%s: %s, %s.', coalesce(v_client_name, 'Una clienta'), coalesce(v_service_name, 'Servicio'), v_when),
          '/admin/studio?section=schedule', 'appointment-update-' || new.id,
          jsonb_build_object('appointmentId', new.id, 'studioId', new.studio_id),
          format('appointment:update:%s:studio:%s:%s', new.id, v_profile_id, new.updated_at));
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' and new.confirmation_requested_at is not null and new.confirmation_requested_at is distinct from old.confirmation_requested_at then
    select c.profile_id into v_profile_id from public.clients c join public.profiles p on p.id = c.profile_id and p.status = 'active'
    where c.id = new.client_id and c.status = 'active' and c.archived_at is null;
    perform public.studio_flow_enqueue_push_notification(v_profile_id, 'appointment_confirmation', 'Confirma tu cita en Studio Flow',
      format('Confirma tu asistencia para %s el %s.', coalesce(v_service_name, 'tu servicio'), v_when),
      '/client/appointments', 'appointment-confirmation-' || new.id, jsonb_build_object('appointmentId', new.id),
      format('appointment:confirmation:%s', new.id));
  end if;

  if tg_op = 'UPDATE' and (new.client_confirmed_at is distinct from old.client_confirmed_at or (new.status = 'cancelled' and old.status <> 'cancelled')) then
    select a.profile_id into v_profile_id from public.artists a where a.id = new.artist_id and a.status = 'active' and a.archived_at is null;
    if v_profile_id is distinct from auth.uid() then
      perform public.studio_flow_enqueue_push_notification(v_profile_id, 'client_appointment_response',
        case when new.status = 'cancelled' then 'La clienta canceló su cita' else 'La clienta confirmó su cita' end,
        format('%s: %s, %s.', coalesce(v_client_name, 'Una clienta'), coalesce(v_service_name, 'Servicio'), v_when),
        '/artist/appointments', 'appointment-response-' || new.id, jsonb_build_object('appointmentId', new.id),
        format('appointment:response:%s:%s:%s', new.id, new.status, coalesce(new.client_confirmed_at::text, 'cancelled')));
    end if;
  end if;

  if tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at then
    select c.profile_id into v_profile_id from public.clients c join public.profiles p on p.id = c.profile_id and p.status = 'active'
    where c.id = new.client_id and c.status = 'active' and c.archived_at is null;
    if v_profile_id is distinct from auth.uid() then
      perform public.studio_flow_enqueue_push_notification(v_profile_id, 'appointment_rescheduled', 'Tu cita fue reagendada',
        format('%s ahora está programado para el %s.', coalesce(v_service_name, 'Tu servicio'), v_when),
        '/client/appointments', 'appointment-rescheduled-' || new.id, jsonb_build_object('appointmentId', new.id),
        format('appointment:rescheduled:%s:%s', new.id, new.reschedule_count));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists studio_flow_appointment_push_trigger on public.appointments;
create trigger studio_flow_appointment_push_trigger
after insert or update of confirmation_requested_at, client_confirmed_at, status, starts_at on public.appointments
for each row execute function public.studio_flow_queue_appointment_push();

revoke all on function public.studio_flow_get_appointment_reschedule_availability(uuid,date) from public;
revoke all on function public.studio_flow_reschedule_appointment(uuid,uuid[]) from public;
revoke all on function public.studio_flow_queue_appointment_push() from public, anon, authenticated;
grant execute on function public.studio_flow_get_appointment_reschedule_availability(uuid,date) to authenticated;
grant execute on function public.studio_flow_reschedule_appointment(uuid,uuid[]) to authenticated;

commit;
