begin;
do $$
declare a record; result jsonb; owner_id uuid; rejected boolean:=false;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 select ap.*,ar.profile_id as actor into a from public.appointments ap
 join public.artists ar on ar.id=ap.artist_id join public.profiles p on p.id=ar.profile_id
 join public.clients c on c.id=ap.client_id join public.profiles cp on cp.id=c.profile_id
 where ap.status='scheduled' and ap.ends_at<now() and ap.studio_id is null
 and ar.status='active' and p.status='active' and cp.status='active' and c.status='active'
 and not exists(select 1 from public.flow_point_ledger l where l.appointment_id=ap.id) limit 1;
 if a.id is null then raise exception 'Existing eligible appointment required'; end if;
 perform set_config('request.jwt.claim.sub',a.actor::text,true);
 update public.appointments set reward_points_snapshot=30 where id=a.id;
 update public.artist_marketing_preferences set flow_points_enabled=true where artist_id=a.artist_id;
 begin
   perform public.studio_flow_artist_award_appointment_points(a.id);
 exception when raise_exception then
   if sqlerrm<>'Marca la cita como completada antes de otorgar Flow Points.' then raise; end if;
   rejected:=true;
 end;
 if not rejected then raise exception 'Scheduled appointment awarded points'; end if;
 perform public.studio_flow_complete_appointment(a.id);
 perform public.studio_flow_artist_award_appointment_points(a.id);
 perform public.studio_flow_artist_award_appointment_points(a.id);
 if (select count(*) from public.flow_point_ledger where appointment_id=a.id and movement_type='earn')<>1 then raise exception 'Duplicate award'; end if;
 if not exists(select 1 from public.commissions where appointment_id=a.id) then raise exception 'Commission missing'; end if;
 rejected:=false;
 begin perform public.studio_flow_owner_get_agenda('artist',a.artist_id,0);
 exception when others then
   if sqlerrm<>'Platform owner role required' then raise; end if;
   rejected:=true;
 end;
 if not rejected then raise exception 'Artist accessed owner agenda'; end if;
 select id into owner_id from public.profiles where default_role='platform_owner' and status='active' limit 1;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 result:=public.studio_flow_owner_get_agenda('artist',a.artist_id,0);
 if jsonb_array_length(result)=0 then raise exception 'Owner agenda empty'; end if;
 if public.studio_flow_get_appointment_payment_details(array[(result->0->>'id')::uuid])='{}'::jsonb then raise exception 'Owner payment details missing'; end if;
 raise notice 'PASS: completion required, one award, commission created, agenda owner-only with payment details';
end $$;
rollback;
