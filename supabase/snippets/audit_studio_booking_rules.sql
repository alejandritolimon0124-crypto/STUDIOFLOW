-- Run only against the isolated audit database. Every change is rolled back.
\set ON_ERROR_STOP on
begin;
do $$
declare
 a public.appointments%rowtype;
 s public.schedules%rowtype;
 slot_id uuid;
 t timestamptz := '2040-01-16 10:00:00+00';
 rejected boolean := false;
begin
 if current_database() <> 'studioflow_audit_verified_20260913' then
  raise exception 'Isolated audit database required';
 end if;
 select * into strict a from public.appointments where membership_id is not null limit 1;
 select * into strict s from public.schedules where membership_id=a.membership_id limit 1;
 update public.schedules set timezone='UTC', status='active', archived_at=null,
  min_advance_hours=0, slot_interval_minutes=15 where id=s.id;
 delete from public.schedule_rules where schedule_id=s.id;
 insert into public.schedule_rules(schedule_id,weekday,is_active,start_time,end_time,breaks)
 values(s.id,extract(dow from t)::integer,true,'08:00','20:00','[]');
 insert into public.availability_slots(schedule_id,artist_id,studio_id,membership_id,starts_at,ends_at)
 values(s.id,a.artist_id,a.studio_id,a.membership_id,t,t+interval '1 hour') returning id into slot_id;
 if not public.studio_flow_slot_obeys_booking_rules(slot_id,t+interval '1 hour') then
  raise exception 'FAIL: baseline availability';
 end if;
 raise notice 'PASS: baseline availability';
 update public.schedules set min_advance_hours=1000000 where id=s.id;
 if public.studio_flow_slot_obeys_booking_rules(slot_id,t+interval '1 hour') then
  raise exception 'FAIL: minimum advance';
 end if;
 update public.schedules set min_advance_hours=0 where id=s.id;
 raise notice 'PASS: minimum advance';
 insert into public.calendar_blocks(schedule_id,block_type,starts_at,ends_at)
 values(s.id,'personal',t-interval '1 day',t+interval '2 days');
 if public.studio_flow_slot_obeys_booking_rules(slot_id,t+interval '1 hour') then
  raise exception 'FAIL: blocked date range';
 end if;
 delete from public.calendar_blocks where schedule_id=s.id and starts_at=t-interval '1 day';
 raise notice 'PASS: blocked date range';
 update public.schedule_rules set breaks='[{"start":"09:00","end":"09:30"},{"start":"10:30","end":"11:00"}]'
 where schedule_id=s.id;
 if public.studio_flow_slot_obeys_booking_rules(slot_id,t+interval '1 hour') then
  raise exception 'FAIL: second break overlap';
 end if;
 if not public.studio_flow_slot_obeys_booking_rules(slot_id,t+interval '30 minutes') then
  raise exception 'FAIL: exact break boundary';
 end if;
 update public.schedule_rules set breaks='[]' where schedule_id=s.id;
 raise notice 'PASS: multiple breaks and exact boundary';
 insert into public.appointments(client_id,artist_id,studio_id,membership_id,service_offering_id,
  availability_slot_id,starts_at,ends_at,status,booking_source)
 values(a.client_id,a.artist_id,a.studio_id,a.membership_id,a.service_offering_id,
  slot_id,t,t+interval '1 hour','scheduled','studio');
 begin
  insert into public.appointments(client_id,artist_id,studio_id,membership_id,service_offering_id,
   availability_slot_id,starts_at,ends_at,status,booking_source)
  values(a.client_id,a.artist_id,a.studio_id,a.membership_id,a.service_offering_id,
   slot_id,t,t+interval '1 hour','scheduled','studio');
 exception when others then
  if sqlerrm not like '%reglas de la agenda%' then raise; end if;
  rejected := true;
 end;
 if not rejected then raise exception 'FAIL: duplicate reservation'; end if;
 raise notice 'PASS: second reservation rejected by booking trigger';
end;
$$;
rollback;
