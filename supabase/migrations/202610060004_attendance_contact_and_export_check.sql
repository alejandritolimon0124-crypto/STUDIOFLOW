do $$
declare definition text;
begin
  select pg_get_functiondef('public.studio_flow_provider_attendance_cases(uuid)'::regprocedure) into definition;
  if position('''client'', c.display_name,' in definition) = 0 then
    raise exception 'Review provider case response before adding client contact';
  end if;
  definition := replace(definition, '''client'', c.display_name,',
    '''client'', c.display_name, ''clientPhone'', c.phone,');
  execute definition;

  select pg_get_functiondef('public.studio_flow_provider_export_events(uuid,integer,integer)'::regprocedure) into definition;
  if position('case when a.status=''completed'' then coalesce(comm.amount' in definition) = 0 then
    raise exception 'Cancelled events must export zero commission';
  end if;
end $$;
