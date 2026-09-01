do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_artist_award_appointment_points was not found';
  end if;

  v_definition := replace(
    v_definition,
    'if not exists (
    select 1
    from artist_marketing_preferences amp
    where amp.artist_id = v_appointment.artist_id
      and v_appointment.studio_id is null
      and v_appointment.membership_id is null
      and amp.flow_points_enabled
  ) then
    raise exception ''Flow Points are paused for this profile'';
  end if;',
    'if v_appointment.studio_id is null
    and v_appointment.membership_id is null
    and not exists (
      select 1
      from artist_marketing_preferences amp
      where amp.artist_id = v_appointment.artist_id
        and amp.flow_points_enabled
    ) then
    raise exception ''Flow Points are paused for this profile'';
  end if;'
  );

  execute v_definition;
end;
$$;
