begin;
do $$
declare d text; marker text := '  -- Serialize against client suspension before granting a new benefit.';
begin
 select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure) into d;
 if position(marker in d)=0 then raise exception 'Unexpected award function'; end if;
 d:=replace(d,marker,$guard$
  -- Studio eligibility applies to both the artist and the studio owner.
  if v_appointment.studio_id is not null then
    perform 1 from public.studios s
    where s.id=v_appointment.studio_id and s.studio_status='approved' and s.archived_at is null
    for share;
    if not found then
      raise exception 'El estudio esta suspendido o inactivo y no puede otorgar beneficios.' using errcode='42501';
    end if;
  end if;
  -- Serialize against client suspension before granting a new benefit.$guard$);
 execute d;
end $$;
commit;
