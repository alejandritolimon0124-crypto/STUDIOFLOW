do $$
declare
  v_function_definition text;
  v_updated_function_definition text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_book_appointment(uuid[], uuid, text)'::regprocedure)
  into v_function_definition;

  if v_function_definition is null then
    raise exception 'studio_flow_marketplace_book_appointment function was not found';
  end if;

  if position('studio_flow_marketplace_booking_overlap_guard' in v_function_definition) = 0 then
    v_updated_function_definition := replace(
      v_function_definition,
      '  insert into appointments (
',
      '  -- studio_flow_marketplace_booking_overlap_guard
  if exists (
    select 1
    from appointments appointment
    where appointment.status in (''scheduled'', ''disputed'')
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > v_starts_at
      and appointment.artist_id = v_artist_id
      and appointment.studio_id is not distinct from v_studio_id
      and appointment.membership_id is not distinct from v_membership_id
  ) then
    raise exception ''This time is no longer available'';
  end if;

  if exists (
    select 1
    from appointments appointment
    where appointment.status in (''scheduled'', ''disputed'')
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > v_starts_at
      and appointment.client_id = v_client.id
  ) then
    raise exception ''Ya tienes una cita en este horario'';
  end if;

  insert into appointments (
'
    );

    if v_updated_function_definition = v_function_definition then
      raise exception 'Could not patch studio_flow_marketplace_book_appointment overlap guard';
    end if;

    execute v_updated_function_definition;
  end if;
end $$;
