begin;

do $migration$
declare
  d text;
  original text := E'if lower(coalesce(p_action, '''')) = ''confirm'' then\n    v_next_status := ''scheduled'';';
  replacement text := E'if lower(coalesce(p_action, '''')) = ''confirm'' then\n    if v_appointment.client_confirmed_at is not null then\n      raise exception ''La asistencia de esta cita ya fue confirmada.'';\n    end if;\n\n    v_next_status := ''scheduled'';';
begin
  select pg_get_functiondef('public.studio_flow_client_update_appointment_response(uuid,text)'::regprocedure) into d;
  if position(original in d) = 0 then
    raise exception 'Expected client confirmation branch was not found';
  end if;
  execute replace(d, original, replacement);
end;
$migration$;

grant execute on function public.studio_flow_client_update_appointment_response(uuid,text) to authenticated;

commit;
