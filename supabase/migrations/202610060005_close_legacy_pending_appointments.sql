do $$
declare definition text;
  old_guard text := 'and a.ends_at >= (select active_since from public.studio_flow_attendance_policy where id = true)';
begin
  select pg_get_functiondef('public.studio_flow_provider_attendance_cases(uuid)'::regprocedure)
    into definition;
  if position(old_guard in definition) = 0 then
    raise exception 'Review overdue policy before including older pending appointments';
  end if;
  definition := replace(definition, old_guard, '');
  execute definition;
end $$;

do $$
declare record_item record;
begin
  for record_item in
    select 'artist' as kind, ar.display_name as name, count(a.id) as overdue_count,
      min(a.ends_at) as oldest_end
    from public.artists ar
    join public.appointments a on a.artist_id = ar.id
    where ar.display_name ilike '%dennis%' and a.status = 'scheduled'
      and a.ends_at <= now() - interval '24 hours'
    group by ar.id, ar.display_name
    union all
    select 'studio' as kind, coalesce(sp.commercial_name, s.name) as name,
      count(a.id) as overdue_count, min(a.ends_at) as oldest_end
    from public.studios s
    left join public.studio_profiles sp on sp.studio_id = s.id
    join public.appointments a on a.studio_id = s.id
    where (s.name ilike '%dennis%' or sp.commercial_name ilike '%dennis%')
      and a.status = 'scheduled' and a.ends_at <= now() - interval '24 hours'
    group by s.id, sp.commercial_name, s.name
  loop
    raise notice 'Dennis overdue attendance audit: % % has % appointments; oldest ended %',
      record_item.kind, record_item.name, record_item.overdue_count, record_item.oldest_end;
  end loop;
end $$;
