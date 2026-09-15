-- Run only against the isolated restored audit database. All changes roll back.
begin;
do $$
declare s record; payload jsonb; result jsonb; before_count bigint; slot record; checked integer; rejected boolean; service_id uuid; client_id uuid; booking_date date; client_actor uuid; slot_ids uuid[]; appointment_id uuid; reward_id uuid;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Audit database required'; end if;
 select count(*) into before_count from public.appointments;
 for s in select sc.*,coalesce(a.profile_id,ma.profile_id) as actor
 from public.schedules sc left join public.artists a on a.id=sc.artist_id
 left join public.artist_studio_memberships m on m.id=sc.membership_id
 left join public.artists ma on ma.id=m.artist_id loop
 perform set_config('request.jwt.claim.sub',s.actor::text,true);
 payload:=jsonb_build_object('timezone',s.timezone,'intervalMinutes',15,'minAdvanceHours',0,
 'schedule',jsonb_build_array(jsonb_build_object('weekday',1,'active',true,'start','10:00','end','18:00',
 'blocks',jsonb_build_array(jsonb_build_object('start','12:00','end','13:00'),jsonb_build_object('start','15:00','end','16:00')))), 'blockedDates','[]'::jsonb);
 result:=public.studio_flow_artist_save_context_schedule_settings(payload,s.owner_type::text,s.membership_id);
 if not exists(select 1 from jsonb_array_elements(result->'schedule') r where (r->>'weekday')::int=1 and jsonb_array_length(r->'blocks')=2) then raise exception 'Break roundtrip failed'; end if;
 if (result->>'minAdvanceHours')::int<>0 then raise exception 'Zero notice failed'; end if;
 if exists(select 1 from public.availability_slots sl where sl.schedule_id=s.id and sl.status='available' and sl.starts_at>now()
 and extract(dow from sl.starts_at at time zone s.timezone)=1
 and (sl.starts_at at time zone s.timezone)::time<'16:00'::time and (sl.ends_at at time zone s.timezone)::time>'15:00'::time) then raise exception 'Second break available'; end if;
 checked:=0;
 for slot in select sl.* from public.availability_slots sl where sl.schedule_id=s.id
 and sl.starts_at>now()+interval '21 days' and sl.starts_at<now()+interval '29 days'
 and (sl.starts_at at time zone s.timezone)::time in ('11:45'::time,'14:45'::time,'16:00'::time)
 and sl.status='available' loop
 if (slot.starts_at at time zone s.timezone)::time in ('11:45'::time,'14:45'::time) then
  if public.studio_flow_slot_obeys_booking_rules(slot.id,slot.starts_at+interval '30 minutes') then raise exception 'Cross-break reservation allowed'; end if;
  if not public.studio_flow_slot_obeys_booking_rules(slot.id,slot.starts_at+interval '15 minutes') then raise exception 'Reservation ending at break rejected'; end if;
 else
  if not public.studio_flow_slot_obeys_booking_rules(slot.id,slot.starts_at+interval '30 minutes') then raise exception 'Free reservation rejected'; end if;
  update public.schedules set min_advance_hours=1000 where id=s.id;
  if public.studio_flow_slot_obeys_booking_rules(slot.id,slot.starts_at+interval '30 minutes') then raise exception 'Notice bypassed'; end if;
  update public.schedules set min_advance_hours=0 where id=s.id;
 end if;
 checked:=checked+1;
 end loop;
 if checked<3 then raise exception 'Insufficient availability cases tested'; end if;
 rejected:=false;
 begin
 perform public.studio_flow_validate_breaks('[{"start":"12:00","end":"13:00"},{"start":"12:30","end":"14:00"}]'::jsonb,'10:00','18:00');
 exception when raise_exception then rejected:=true;
 end;
 if not rejected then raise exception 'Overlapping breaks accepted'; end if;
 select id into service_id from public.service_offerings where status='active' and duration_minutes=60
 and ((s.owner_type='artist' and artist_id=s.artist_id and owner_type='artist') or (s.owner_type='membership' and membership_id=s.membership_id and owner_type='membership')) limit 1;
 select c.id into client_id from public.clients c join public.profiles p on p.id=c.profile_id where c.status='active' and p.status='active' and c.archived_at is null limit 1;
 select (sl.starts_at at time zone s.timezone)::date into booking_date from public.availability_slots sl where sl.schedule_id=s.id and sl.starts_at>now()+interval '21 days' and (sl.starts_at at time zone s.timezone)::time='16:00' and sl.status='available' order by sl.starts_at limit 1;
 if service_id is null or client_id is null or booking_date is null then raise exception 'Existing booking inputs missing'; end if;
 begin
   update public.clients set status='inactive' where id=client_id;
   rejected:=false;
   begin
     perform public.studio_flow_artist_create_manual_appointment_core(client_id,service_id,booking_date,'16:00',null);
   exception when raise_exception then
     if sqlerrm<>'Active client required' then raise; end if;
     rejected:=true;
   end;
   if not rejected then raise exception 'Manual booking accepted suspended client'; end if;
   raise notice 'Manual booking rejects inactive client for %',s.owner_type;
   raise exception using errcode='PZ003',message='Rollback client suspension';
 exception when sqlstate 'PZ003' then null;
 end;
 if s.owner_type='membership' then
   begin
     update public.studios set studio_status='suspended' where id=(select studio_id from public.artist_studio_memberships where id=s.membership_id);
     rejected:=false;
     begin
       perform public.studio_flow_artist_create_manual_appointment_core(client_id,service_id,booking_date,'16:00',null);
     exception when raise_exception then
       if sqlerrm<>'Studio is not available' then raise; end if;
       rejected:=true;
     end;
     if not rejected then raise exception 'Manual booking accepted suspended studio'; end if;
     raise notice 'Manual booking rejects suspended studio';
     raise exception using errcode='PZ003',message='Rollback studio suspension';
   exception when sqlstate 'PZ003' then null;
   end;
   begin
     update public.artist_studio_memberships set status='inactive' where id=s.membership_id;
     rejected:=false;
     begin
       perform public.studio_flow_artist_create_manual_appointment_core(client_id,service_id,booking_date,'16:00',null);
     exception when raise_exception then
       if sqlerrm<>'Service membership does not belong to the authenticated artist' then raise; end if;
       rejected:=true;
     end;
     if not rejected then raise exception 'Inactive membership accepted manual booking'; end if;
     raise notice 'Manual booking rejects inactive membership';
     raise exception using errcode='PZ003',message='Rollback membership suspension';
   exception when sqlstate 'PZ003' then null;
   end;
 end if;
 rejected:=false;
 begin
 perform public.studio_flow_artist_create_manual_appointment_core(client_id,service_id,booking_date,'14:45',null);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Cross-break booking created'; end if;
 begin
 perform public.studio_flow_artist_create_manual_appointment_core(client_id,service_id,booking_date,'16:00',null);
 if (select count(*) from public.appointments)<>before_count+1 then raise exception 'Booking missing'; end if;
 raise exception using errcode='PZ001',message='Rollback successful test reservation';
 exception when sqlstate 'PZ001' then null;
 end;
 select profile_id into client_actor from public.clients where id=client_id;
 perform set_config('request.jwt.claim.sub',client_actor::text,true);
 select array_agg(sl.id order by sl.starts_at) into slot_ids from public.availability_slots sl
 where sl.schedule_id=s.id and (sl.starts_at at time zone s.timezone)::date=booking_date
 and ((sl.starts_at at time zone s.timezone)::time='14:45' or ((sl.starts_at at time zone s.timezone)::time>='16:00' and (sl.starts_at at time zone s.timezone)::time<'16:45')) and sl.status='available';
 rejected:=false;
 begin
 perform public.studio_flow_marketplace_book_with_reward(slot_ids,service_id,null,null);
 exception when others then
  if sqlerrm not in ('Selected slots are not contiguous','Este horario ya no esta disponible segun las reglas de la agenda.') then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'Patient booked across second break'; end if;
 select array_agg(sl.id order by sl.starts_at) into slot_ids from public.availability_slots sl
 where sl.schedule_id=s.id and (sl.starts_at at time zone s.timezone)::date=booking_date
 and (sl.starts_at at time zone s.timezone)::time>='16:00' and (sl.starts_at at time zone s.timezone)::time<'17:00' and sl.status='available';
 if s.owner_type='membership' then
   begin
     update public.studios set studio_status='suspended'
     where id=(select studio_id from public.artist_studio_memberships where id=s.membership_id);
     rejected:=false;
     begin
       perform public.studio_flow_marketplace_book_with_reward(slot_ids,service_id,null,null);
     exception when raise_exception then
       if sqlerrm<>'Studio is not available' then raise; end if;
       rejected:=true;
     end;
     if not rejected then raise exception 'Suspended studio accepted booking'; end if;
     if (select count(*) from public.appointments)<>before_count then raise exception 'Suspended booking changed appointments'; end if;
     if exists(select 1 from public.availability_slots where id=any(slot_ids) and status<>'available') then raise exception 'Suspended booking occupied slots'; end if;
     raise notice 'Suspended studio rejects booking without occupying slots';
     raise exception using errcode='PZ002',message='Rollback studio suspension';
   exception when sqlstate 'PZ002' then null;
   end;
 end if;
 begin
 select id into reward_id from public.rewards where status='active' and archived_at is null limit 1;
 if reward_id is null then raise exception 'Existing reward required'; end if;
 rejected:=false;
 begin
  perform public.studio_flow_marketplace_book_with_reward(slot_ids,service_id,reward_id,null);
 exception when others then
  if sqlerrm not in ('Insufficient Flow Points','Active Flow Points reward required','Esta cita ya tiene una promocion aplicada y no admite puntos adicionales.') then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'Expected unavailable reward rejection'; end if;
 if (select count(*) from public.appointments)<>before_count then raise exception 'Failed reward left a booking'; end if;
 if exists(select 1 from public.availability_slots where id=any(slot_ids) and status<>'available') then raise exception 'Failed reward left occupied slots'; end if;
 raise notice 'Failed reward rolls back booking and slots for %',s.owner_type;
 perform public.studio_flow_marketplace_book_with_reward(slot_ids,service_id,null,null);
 if (select count(*) from public.appointments)<>before_count+1 then raise exception 'Patient booking missing'; end if;
 select ap.id into appointment_id from public.appointments ap where ap.service_offering_id=service_id and ap.starts_at=(select starts_at from public.availability_slots where id=slot_ids[1]) and ap.status='scheduled';
 if appointment_id is null then raise exception 'Booked appointment missing'; end if;
 perform set_config('request.jwt.claim.sub',s.actor::text,true);
 perform public.studio_flow_artist_request_appointment_confirmations('artist',booking_date,s.owner_type::text,s.membership_id);
 if not exists(select 1 from public.appointments where id=appointment_id and confirmation_requested_at is not null) then raise exception 'Confirmation request missing'; end if;
 perform set_config('request.jwt.claim.sub',client_actor::text,true);
 perform public.studio_flow_client_update_appointment_response(appointment_id,'confirm');
 if not exists(select 1 from public.appointments where id=appointment_id and client_confirmed_at is not null and status='scheduled') then raise exception 'Confirmation response missing'; end if;
 perform public.studio_flow_client_update_appointment_response(appointment_id,'cancel');
 if exists(select 1 from public.availability_slots where id=any(slot_ids) and status<>'available') then raise exception 'Cancellation did not release all slots'; end if;
 perform public.studio_flow_marketplace_book_appointment(slot_ids,service_id,null);
 if (select count(*) from public.appointments)<>before_count+2 then raise exception 'Released slots could not be booked again'; end if;
 raise notice 'Confirmation request, client response, cancellation and rebooking passed for %',s.owner_type;
 raise exception using errcode='PZ001',message='Rollback successful patient reservation';
 exception when sqlstate 'PZ001' then null;
 end;
 raise notice 'Availability, manual and patient booking passed for % (% slots); reservations rolled back',s.owner_type,checked;
 end loop;
 if (select count(*) from public.appointments)<>before_count then raise exception 'Appointments changed'; end if;
end;$$;
rollback;
