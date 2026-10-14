-- Reuse the validated public booking path, preserving all ownership and slot checks.
do $$
declare v_sql text;
begin
  select pg_get_functiondef('public.studio_flow_public_book_google_reservation(uuid,uuid[],uuid,text,text,text,text)'::regprocedure) into v_sql;
  if v_sql is null or position('a.booking_source=''google''' in v_sql) = 0
    or position('''scheduled'',''google''' in v_sql) = 0 then
    raise exception 'Public booking function changed; review social booking migration';
  end if;
  v_sql := replace(v_sql, 'studio_flow_public_book_google_reservation', 'studio_flow_public_book_social_reservation');
  v_sql := regexp_replace(v_sql, '\)\s+RETURNS jsonb', ', p_channel text DEFAULT NULL) RETURNS jsonb', 'i');
  if position('p_channel text DEFAULT NULL) RETURNS jsonb' in v_sql) = 0 then
    raise exception 'Could not add source parameter to public booking function';
  end if;
  v_sql := regexp_replace(v_sql, '\mBEGIN\M', E'BEGIN\n  IF p_channel NOT IN (''instagram'', ''facebook'') OR p_channel IS NULL THEN\n    RAISE EXCEPTION ''Canal de reserva no valido.'';\n  END IF;', 'i');
  v_sql := replace(v_sql, 'a.booking_source=''google''', 'a.booking_source in (''google'',''instagram'',''facebook'')');
  v_sql := replace(v_sql, '''scheduled'',''google''', '''scheduled'',p_channel::public.booking_source');
  v_sql := replace(v_sql, '''bookingSource'',''google''', '''bookingSource'',p_channel');
  v_sql := replace(v_sql, 'public_google_booking_created', 'public_social_booking_created');
  execute v_sql;

  -- Count duplicate public bookings across all three tracked links.
  select pg_get_functiondef('public.studio_flow_public_book_google_reservation(uuid,uuid[],uuid,text,text,text,text)'::regprocedure) into v_sql;
  v_sql := replace(v_sql, 'a.booking_source=''google''', 'a.booking_source in (''google'',''instagram'',''facebook'')');
  execute v_sql;

  select pg_get_functiondef('public.studio_flow_growth_metrics_base(uuid,uuid,integer)'::regprocedure) into v_sql;
  if position('''googleLink''' in v_sql) = 0 then raise exception 'Growth report changed; review source counters'; end if;
  v_sql := replace(v_sql, '''googleLink'', count(*) filter (where source = ''google''),',
    '''googleLink'', count(*) filter (where source = ''google''), ''instagramLink'', count(*) filter (where source = ''instagram''), ''facebookLink'', count(*) filter (where source = ''facebook''),');
  v_sql := replace(v_sql, 'source not in (''marketplace'',''google'')', 'source not in (''marketplace'',''google'',''instagram'',''facebook'')');
  v_sql := replace(v_sql, '''marketplace'',''google'',''client_portal''', '''marketplace'',''google'',''instagram'',''facebook'',''client_portal''');
  execute v_sql;

  select pg_get_functiondef('public.studio_flow_queue_appointment_push()'::regprocedure) into v_sql;
  v_sql := replace(v_sql, '''client_portal'', ''marketplace'', ''google''', '''client_portal'', ''marketplace'', ''google'', ''instagram'', ''facebook''');
  execute v_sql;
end $$;

revoke all on function public.studio_flow_public_book_social_reservation(uuid,uuid[],uuid,text,text,text,text,text) from public;
grant execute on function public.studio_flow_public_book_social_reservation(uuid,uuid[],uuid,text,text,text,text,text) to anon, authenticated;
