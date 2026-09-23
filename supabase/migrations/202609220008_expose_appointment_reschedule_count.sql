begin;

do $migration$
declare
  signature text;
  d text;
begin
  foreach signature in array array[
    'public.studio_flow_get_client_appointments()',
    'public.studio_flow_get_artist_appointments(uuid)'
  ]
  loop
    select pg_get_functiondef(signature::regprocedure) into d;
    d := replace(
      d,
      '''confirmation_requested_at'', appt.confirmation_requested_at,',
      E'''confirmation_requested_at'', appt.confirmation_requested_at,\n        ''rescheduleCount'', appt.reschedule_count,\n        ''reschedule_count'', appt.reschedule_count,'
    );
    execute d;
  end loop;
end;
$migration$;

grant execute on function public.studio_flow_get_client_appointments() to authenticated;
grant execute on function public.studio_flow_get_artist_appointments(uuid) to authenticated;

commit;
