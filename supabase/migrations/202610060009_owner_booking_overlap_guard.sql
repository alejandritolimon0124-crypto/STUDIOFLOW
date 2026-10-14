do $$
declare definition text;
declare target text := 'and not exists(select 1 from appointments appointment';
begin
  select pg_get_functiondef('public.studio_flow_owner_booking_calendar(uuid,uuid,date,uuid,date)'::regprocedure)
  into definition;
  if position(target in definition)=0 then
    raise exception 'Owner booking calendar definition changed';
  end if;
  definition := replace(definition,target,
    'and not exists(select 1 from availability_slots blocked '
    ||'where blocked.membership_id=p_membership_id '
    ||'and blocked.starts_at<candidate.candidate_end '
    ||'and blocked.ends_at>candidate.starts_at '
    ||'and blocked.status<>''available'') '
    ||target);
  execute definition;
end $$;
