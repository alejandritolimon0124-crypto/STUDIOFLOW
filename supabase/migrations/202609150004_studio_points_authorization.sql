begin;
do $$
declare d text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure) into d;
  if position('s.status = ''active''' in d)=0 then raise exception 'Unexpected studio points authorization'; end if;
  execute replace(d,'s.status = ''active''','s.studio_status = ''approved''');
end $$;
commit;
