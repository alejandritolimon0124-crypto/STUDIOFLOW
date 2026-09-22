do $$
declare
  v_definition text;
  v_original text := 'if tg_op = ''INSERT'' and new.status = ''scheduled'' then';
  v_replacement text := E'if tg_op = ''INSERT''\n    and new.status = ''scheduled''\n    and new.booking_source in (''client_portal'', ''marketplace'', ''google'')\n  then';
begin
  select pg_get_functiondef('public.studio_flow_queue_appointment_push()'::regprocedure)
  into v_definition;

  if position(v_original in v_definition) = 0 then
    raise exception 'Expected booking notification condition was not found';
  end if;

  execute replace(v_definition, v_original, v_replacement);

  revoke all on function public.studio_flow_queue_appointment_push()
  from public, anon, authenticated;
end;
$$;
