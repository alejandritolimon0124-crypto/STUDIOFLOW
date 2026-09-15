begin;
create function public.studio_flow_owner_export_events(p_type text,p_id uuid,p_year integer,p_month integer)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare start_day date; profile jsonb; events jsonb; ids uuid[];
begin
 perform public.studio_flow_admin_assert_platform_owner();
 if p_type is null or p_type not in ('artist','studio') or p_id is null or p_year is null or p_year not between 1900 and 9998 or p_month is null or p_month not between 1 and 12 then raise exception 'Invalid export period or target'; end if;
 start_day:=make_date(p_year,p_month,1);
 if p_type='artist' then
 select jsonb_build_object('name',coalesce(ap.artistic_name,a.display_name),'fullName',p.display_name,'phone',p.phone,'email',p.email)
 into profile from artists a left join profiles p on p.id=a.profile_id left join artist_profiles ap on ap.artist_id=a.id where a.id=p_id;
 else
 select jsonb_build_object('name',coalesce(sp.commercial_name,s.name),'fullName',p.display_name,'phone',coalesce(sp.phone,p.phone),'email',coalesce(sp.email,p.email))
 into profile from studios s left join profiles p on p.id=s.owner_profile_id left join studio_profiles sp on sp.studio_id=s.id where s.id=p_id;
 end if;
 if profile is null then raise exception 'Profile not found'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.date,q.id),'[]'::jsonb),array_agg(q.id) into events,ids from (
 select a.id,to_char(a.starts_at at time zone 'America/Mexico_City','YYYY-MM-DD HH24:MI') as date,
 c.display_name as client,so.name as service,a.status,
 s.name as studio,
 coalesce((select sum(l.points) from flow_point_ledger l where l.appointment_id=a.id and l.movement_type='earn'),0) as awarded,
 a.reward_multiplier_snapshot as multiplier,
 coalesce(e.calculation_version like '%happy-hour-discount-%',false) as happy_hour
 from appointments a left join clients c on c.id=a.client_id left join service_offerings so on so.id=a.service_offering_id
 left join studios s on s.id=a.studio_id left join appointment_economies e on e.appointment_id=a.id
 where ((p_type='artist' and a.artist_id=p_id) or (p_type='studio' and a.studio_id=p_id))
 and a.starts_at >= (start_day::timestamp at time zone 'America/Mexico_City')
 and a.starts_at < ((start_day+interval '1 month')::timestamp at time zone 'America/Mexico_City')
 ) q;
 return jsonb_build_object('profile',profile,'events',events,'payments',public.studio_flow_get_appointment_payment_details(coalesce(ids,'{}'::uuid[])));
end $$;
revoke all on function public.studio_flow_owner_export_events(text,uuid,integer,integer) from public,anon;
grant execute on function public.studio_flow_owner_export_events(text,uuid,integer,integer) to authenticated;
commit;
