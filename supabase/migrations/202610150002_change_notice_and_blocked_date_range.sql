begin;

alter table public.schedules
  add column if not exists client_change_notice_hours integer not null default 2
    check (client_change_notice_hours in (2, 4, 6, 12, 24));

alter table public.studios
  add column if not exists client_change_notice_hours integer not null default 2
    check (client_change_notice_hours in (2, 4, 6, 12, 24));

create or replace function public.studio_flow_client_change_notice_hours(p_appointment_id uuid)
returns integer
language sql stable security definer set search_path = public, auth
as $$
  select greatest(
    coalesce(studio.client_change_notice_hours, 2),
    coalesce(schedule.client_change_notice_hours, 2)
  )
  from public.appointments appointment
  left join public.studios studio on studio.id = appointment.studio_id
  left join public.availability_slots slot on slot.id = appointment.availability_slot_id
  left join public.schedules schedule on schedule.id = slot.schedule_id
  where appointment.id = p_appointment_id;
$$;
revoke all on function public.studio_flow_client_change_notice_hours(uuid) from public, anon, authenticated;

create or replace function public.studio_flow_get_studio_change_notice(p_studio_id uuid)
returns integer
language plpgsql security definer set search_path = public, auth
as $$
declare v_hours integer;
begin
  select client_change_notice_hours into v_hours from public.studios
  where id = p_studio_id and owner_profile_id = auth.uid() and archived_at is null;
  if v_hours is null then raise exception 'No tienes permiso para consultar esta configuración'; end if;
  return v_hours;
end;
$$;

create or replace function public.studio_flow_save_studio_change_notice(p_studio_id uuid, p_hours integer)
returns integer
language plpgsql security definer set search_path = public, auth
as $$
declare v_hours integer;
begin
  if p_hours is null or p_hours not in (2, 4, 6, 12, 24) then
    raise exception 'Selecciona 2, 4, 6, 12 o 24 horas';
  end if;
  update public.studios set client_change_notice_hours = p_hours, updated_at = now()
  where id = p_studio_id and owner_profile_id = auth.uid() and archived_at is null
  returning client_change_notice_hours into v_hours;
  if v_hours is null then raise exception 'No tienes permiso para guardar esta configuración'; end if;
  return v_hours;
end;
$$;

revoke all on function public.studio_flow_get_studio_change_notice(uuid) from public, anon;
revoke all on function public.studio_flow_save_studio_change_notice(uuid, integer) from public, anon;
grant execute on function public.studio_flow_get_studio_change_notice(uuid) to authenticated;
grant execute on function public.studio_flow_save_studio_change_notice(uuid, integer) to authenticated;

create or replace function public.studio_flow_artist_block_context_date_range(
  p_start_date date,
  p_end_date date,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare v_date date;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
    or p_end_date - p_start_date > 89 then
    raise exception 'Selecciona un rango válido de hasta 90 días';
  end if;
  perform public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);
  for v_date in select generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day')::date loop
    if not exists (
      select 1 from public.calendar_blocks block
      join public.schedules schedule on schedule.id = block.schedule_id
      where block.reason = 'blocked_date' and block.status = 'active'
        and block.starts_at = (v_date::timestamp at time zone schedule.timezone)
        and (
          (schedule.owner_type = 'artist' and schedule.artist_id = (
            select id from public.artists where profile_id = auth.uid() and status = 'active' limit 1
          ) and p_context_type = 'artist')
          or (schedule.owner_type = 'membership' and schedule.membership_id = p_membership_id and p_context_type = 'membership')
        )
    ) then
      perform public.studio_flow_artist_block_context_date(v_date, p_context_type, p_membership_id);
    end if;
  end loop;
  return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id);
end;
$$;
revoke all on function public.studio_flow_artist_block_context_date_range(date,date,text,uuid) from public, anon;
grant execute on function public.studio_flow_artist_block_context_date_range(date,date,text,uuid) to authenticated;

do $$
declare v_definition text; v_marker text;
begin
  select pg_get_functiondef('public.studio_flow_artist_schedule_payload_for_context(text,uuid)'::regprocedure)
  into v_definition;
  v_marker := '''minAdvanceHours'', v_schedule.min_advance_hours,';
  if strpos(v_definition, v_marker) = 0 then raise exception 'Schedule payload marker not found'; end if;
  v_definition := replace(v_definition, v_marker,
    v_marker || E'\n    ''clientChangeNoticeHours'', v_schedule.client_change_notice_hours,');
  v_marker := '''intervalMinutes'', 15,';
  if strpos(v_definition, v_marker) = 0 then raise exception 'Empty schedule payload marker not found'; end if;
  execute replace(v_definition, v_marker,
    v_marker || E'\n      ''clientChangeNoticeHours'', 2,');

  select pg_get_functiondef('public.studio_flow_artist_save_context_schedule_settings(jsonb,text,uuid)'::regprocedure)
  into v_definition;
  v_marker := 'delete from schedule_rules where schedule_id = v_schedule.id;';
  if strpos(v_definition, v_marker) = 0 then raise exception 'Schedule save marker not found'; end if;
  execute replace(v_definition, v_marker,
    E'if (p_payload->>''clientChangeNoticeHours'')::integer not in (2, 4, 6, 12, 24) then\n    raise exception ''Selecciona 2, 4, 6, 12 o 24 horas'';\n  end if;\n  update schedules set client_change_notice_hours = coalesce((p_payload->>''clientChangeNoticeHours'')::integer, client_change_notice_hours) where id = v_schedule.id;\n  ' || v_marker);

  select pg_get_functiondef('public.studio_flow_client_update_appointment_response(uuid,text)'::regprocedure)
  into v_definition;
  v_marker := 'v_next_status := ''cancelled'';';
  if strpos(v_definition, v_marker) = 0 then raise exception 'Client cancellation marker not found'; end if;
  execute replace(v_definition, v_marker,
    E'if now() > v_appointment.starts_at - make_interval(hours => public.studio_flow_client_change_notice_hours(v_appointment.id)) then\n      raise exception ''El plazo para cancelar esta cita ya pasó. Comunícate con tu artista o estudio.'';\n    end if;\n    ' || v_marker);

  select pg_get_functiondef('public.studio_flow_get_client_appointments()'::regprocedure)
  into v_definition;
  v_marker := '''bookingSource'', appt.booking_source,';
  if strpos(v_definition, v_marker) = 0 then raise exception 'Client appointment read marker not found'; end if;
  execute replace(v_definition, v_marker,
    v_marker || E'\n        ''clientChangeNoticeHours'', public.studio_flow_client_change_notice_hours(appt.id),');

  select pg_get_functiondef('public.studio_flow_get_appointment_reschedule_availability(uuid,date)'::regprocedure)
  into v_definition;
  v_marker := 'if not v_authorized then raise exception ''No tienes permiso para reagendar esta cita.''; end if;';
  if strpos(v_definition, v_marker) = 0 then raise exception 'Reschedule availability marker not found'; end if;
  execute replace(v_definition, v_marker,
    v_marker || E'\n  if exists (select 1 from public.clients where id = v_appointment.client_id and profile_id = auth.uid())\n    and now() > v_appointment.starts_at - make_interval(hours => public.studio_flow_client_change_notice_hours(v_appointment.id)) then\n    raise exception ''El plazo para reagendar esta cita ya pasó. Comunícate con tu artista o estudio.'';\n  end if;');

  select pg_get_functiondef('public.studio_flow_reschedule_appointment(uuid,uuid[])'::regprocedure)
  into v_definition;
  if strpos(v_definition, v_marker) = 0 then raise exception 'Reschedule write marker not found'; end if;
  execute replace(v_definition, v_marker,
    v_marker || E'\n  if exists (select 1 from public.clients where id = v_appointment.client_id and profile_id = auth.uid())\n    and now() > v_appointment.starts_at - make_interval(hours => public.studio_flow_client_change_notice_hours(v_appointment.id)) then\n    raise exception ''El plazo para reagendar esta cita ya pasó. Comunícate con tu artista o estudio.'';\n  end if;');
end;
$$;

commit;
