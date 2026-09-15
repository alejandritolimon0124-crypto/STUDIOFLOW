begin;
do $$
declare d text; marker text := '  -- studio_flow_points_after_appointment_start_guard';
begin
 select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure) into d;
 if position(marker in d)=0 then raise exception 'Unexpected points function'; end if;
 d:=replace(d,marker,$guard$
  if v_appointment.status <> 'completed' or v_appointment.completed_at is null then
    raise exception 'Marca la cita como completada antes de otorgar Flow Points.';
  end if;
$guard$||marker);
 execute d;
end $$;

create function public.studio_flow_owner_get_agenda(p_entity_type text, p_entity_id uuid, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare result jsonb;
begin
 perform public.studio_flow_admin_assert_platform_owner();
 if p_entity_type not in ('artist','studio') or p_entity_type is null or p_entity_id is null or p_offset is null or p_offset<0 then
   raise exception 'Invalid agenda target';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q."startsAt" desc,q.id), '[]'::jsonb) into result
 from (
   select a.id,a.starts_at as "startsAt",a.ends_at as "endsAt",a.status as "appointmentStatus",
     c.display_name as client,ar.display_name as artist,so.name as service,s.name as studio,
     a.completed_at as "completedAt",a.cancelled_at as "cancelledAt"
   from public.appointments a
   left join public.clients c on c.id=a.client_id
   left join public.artists ar on ar.id=a.artist_id
   left join public.service_offerings so on so.id=a.service_offering_id
   left join public.studios s on s.id=a.studio_id
   where (p_entity_type='artist' and a.artist_id=p_entity_id) or (p_entity_type='studio' and a.studio_id=p_entity_id)
   order by a.starts_at desc,a.id limit 20 offset p_offset
 ) q;
 return result;
end $$;
revoke all on function public.studio_flow_owner_get_agenda(text,uuid,integer) from public,anon;
grant execute on function public.studio_flow_owner_get_agenda(text,uuid,integer) to authenticated;
commit;
