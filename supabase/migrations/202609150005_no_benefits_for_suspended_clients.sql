begin;
do $$
declare d text; marker text;
begin
 select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure) into d;
 marker:='  -- studio_flow_points_after_appointment_start_guard';
 if position(marker in d)=0 then raise exception 'Unexpected award function'; end if;
 d:=replace(d,marker,$guard$
  -- Serialize against client suspension before granting a new benefit.
  perform 1 from public.clients c
  where c.id=v_appointment.client_id and c.status='active' and c.archived_at is null
  for share;
  if not found then
    raise exception 'La clienta esta suspendida o inactiva y no puede recibir beneficios de Studio Flow.' using errcode='42501';
  end if;
  if exists(select 1 from public.clients c where c.id=v_appointment.client_id and c.profile_id is not null) then
    perform 1 from public.profiles p join public.clients c on c.profile_id=p.id
    where c.id=v_appointment.client_id and p.status='active' for share of p;
    if not found then
      raise exception 'La cuenta de la clienta esta suspendida y no puede recibir beneficios de Studio Flow.' using errcode='42501';
    end if;
  end if;
  -- studio_flow_points_after_appointment_start_guard$guard$);
 execute d;
end $$;
commit;
