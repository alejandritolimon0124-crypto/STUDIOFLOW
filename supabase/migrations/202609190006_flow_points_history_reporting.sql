begin;

create or replace function public.studio_flow_get_appointment_reward_details(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(jsonb_object_agg(q.id::text, jsonb_build_object(
    'pointsGranted', q.points_granted,
    'rewardMultiplier', q.reward_multiplier,
    'happyHourApplied', q.happy_hour_applied
  )), '{}'::jsonb)
  into v_result
  from (
    select
      a.id,
      coalesce((select sum(l.points) from public.flow_point_ledger l where l.appointment_id = a.id and l.movement_type = 'earn'), 0) as points_granted,
      coalesce(a.reward_multiplier_snapshot, 1) as reward_multiplier,
      coalesce(e.calculation_version like '%happy-hour-discount-%', false) as happy_hour_applied
    from public.appointments a
    left join public.appointment_economies e on e.appointment_id = a.id
    left join public.clients c on c.id = a.client_id
    left join public.artists ar on ar.id = a.artist_id
    left join public.studios s on s.id = a.studio_id
    where a.id = any(coalesce(p_ids, '{}'::uuid[]))
      and (
        c.profile_id = auth.uid()
        or ar.profile_id = auth.uid()
        or s.owner_profile_id = auth.uid()
        or exists (
          select 1
          from public.user_role_assignments ura
          join public.roles r on r.id = ura.role_id
          where ura.profile_id = auth.uid() and ura.status = 'active' and r.code = 'platform_owner'
        )
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.default_role = 'platform_owner'
        )
      )
  ) q;

  return v_result;
end;
$$;

revoke all on function public.studio_flow_get_appointment_reward_details(uuid[]) from public, anon;
grant execute on function public.studio_flow_get_appointment_reward_details(uuid[]) to authenticated;

create or replace function public.studio_flow_owner_get_agenda(p_entity_type text, p_entity_id uuid, p_offset integer, p_date date)
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
     a.completed_at as "completedAt",a.cancelled_at as "cancelledAt",
     coalesce((select sum(l.points) from public.flow_point_ledger l where l.appointment_id=a.id and l.movement_type='earn'),0) as "pointsGranted",
     coalesce(a.reward_multiplier_snapshot,1) as "rewardMultiplier",
     coalesce(e.calculation_version like '%happy-hour-discount-%',false) as "happyHourApplied"
   from public.appointments a
   left join public.clients c on c.id=a.client_id
   left join public.artists ar on ar.id=a.artist_id
   left join public.service_offerings so on so.id=a.service_offering_id
   left join public.studios s on s.id=a.studio_id
   left join public.appointment_economies e on e.appointment_id=a.id
   where ((p_entity_type='artist' and a.artist_id=p_entity_id) or (p_entity_type='studio' and a.studio_id=p_entity_id))
     and (p_date is null or (a.starts_at >= (p_date::timestamp at time zone 'America/Mexico_City')
       and a.starts_at < ((p_date+1)::timestamp at time zone 'America/Mexico_City')))
   order by a.starts_at desc,a.id limit 10 offset p_offset
 ) q;
 return result;
end $$;

revoke all on function public.studio_flow_owner_get_agenda(text,uuid,integer,date) from public,anon;
grant execute on function public.studio_flow_owner_get_agenda(text,uuid,integer,date) to authenticated;

commit;
