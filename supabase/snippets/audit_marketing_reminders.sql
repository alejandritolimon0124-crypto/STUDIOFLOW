\set ON_ERROR_STOP on
begin;
do $$
declare a appointments%rowtype; n integer; result jsonb; actor uuid; other_actor uuid; notice uuid;
begin
  if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
  select ap.* into strict a from appointments ap
  join artists ar on ar.id=ap.artist_id and ar.status='active'
  join profiles p on p.id=ar.profile_id and p.status='active'
  join clients c on c.id=ap.client_id and c.status='active' and c.archived_at is null
  join profiles cp on cp.id=c.profile_id and cp.status='active'
  where ap.ends_at<now() and ap.status in ('scheduled','completed')
  order by ap.starts_at desc limit 1;
  delete from client_notifications where client_id=a.client_id and artist_id=a.artist_id;
  -- Isolate eligibility from other visits in this rollback-only fixture.
  update appointments set status='cancelled',cancelled_at=now() where client_id=a.client_id and artist_id=a.artist_id and id<>a.id;
  update appointments set status='completed',cancelled_at=null,completed_at=now()-interval '40 days'+interval '1 hour',starts_at=now()-interval '40 days',ends_at=now()-interval '40 days'+interval '1 hour'
    where id=a.id;
  insert into client_profiles(client_id,birthday) values(a.client_id,(now() at time zone 'America/Mexico_City')::date)
    on conflict(client_id) do update set birthday=excluded.birthday;
  select profile_id into actor from artists where id=a.artist_id;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  result:=studio_flow_marketing_reminder_settings(a.artist_id,'{"birthday":true,"reactivation":true,"maintenance":true,"maintenance_days":7}');
  if (result->>'maintenance_days')::int<>7 then raise exception 'Save failed'; end if;
  n:=studio_flow_generate_marketing_reminders(a.client_id,a.artist_id);
  if n<>3 then raise exception 'Expected 3 notices, got %',n; end if;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id)<>0 then raise exception 'Duplicate notifications'; end if;
  perform studio_flow_marketing_reminder_settings(a.artist_id,'{"birthday":true,"reactivation":true,"maintenance":true,"maintenance_days":30}');
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id)<>0 then raise exception 'Changing interval duplicates notice'; end if;
  raise notice 'PASS: preferences saved; birthday/reactivation/maintenance; duplicate protection';
  delete from client_notifications where client_id=a.client_id and artist_id=a.artist_id;
  update appointments set starts_at=now()-interval '10 days',ends_at=now()-interval '10 days'+interval '1 hour' where id=a.id;
  update marketing_reminder_preferences set maintenance_days=14 where artist_id=a.artist_id;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id,'maintenance')<>0 then raise exception '14 day reminder too early'; end if;
  update marketing_reminder_preferences set maintenance_days=7 where artist_id=a.artist_id;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id,'maintenance')<>1 then raise exception '7 day reminder missing'; end if;
  delete from client_notifications where client_id=a.client_id and artist_id=a.artist_id;
  update appointments set starts_at=now()-interval '20 days',ends_at=now()-interval '20 days'+interval '1 hour' where id=a.id;
  update marketing_reminder_preferences set maintenance_days=30 where artist_id=a.artist_id;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id,'maintenance')<>0 then raise exception '30 day reminder too early'; end if;
  update marketing_reminder_preferences set maintenance_days=14 where artist_id=a.artist_id;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id,'maintenance')<>1 then raise exception '14 day reminder missing'; end if;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id,'reactivation')<>0 then raise exception 'Reactivation too early'; end if;
  update appointments set starts_at=now()-interval '40 days',ends_at=now()-interval '40 days'+interval '1 hour' where id=a.id;
  raise notice 'PASS: 7/14/30 day thresholds and reactivation threshold';
  delete from client_notifications where client_id=a.client_id and artist_id=a.artist_id;
  update clients set status='inactive' where id=a.client_id;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id)<>0 then raise exception 'Suspended client receives notices'; end if;
  update clients set status='active' where id=a.client_id;
  update artists set status='inactive' where id=a.artist_id;
  if studio_flow_generate_marketing_reminders(a.client_id,a.artist_id)<>0 then raise exception 'Suspended artist sends notices'; end if;
  update artists set status='active' where id=a.artist_id;
  raise notice 'PASS: suspended accounts excluded';
  select profile_id into actor from clients where id=a.client_id;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  result:=studio_flow_client_get_notifications();
  if jsonb_array_length(result->'notifications')<3 then raise exception 'Inbox missing notifications'; end if;
  select id into notice from client_notifications where client_id=a.client_id and artist_id=a.artist_id limit 1;
  select id into other_actor from profiles where id<>actor limit 1;
  if other_actor is null then raise exception 'Need second account'; end if;
  perform set_config('request.jwt.claim.sub',other_actor::text,true);
  perform studio_flow_client_read_marketing_notice(notice);
  if exists(select 1 from client_notifications where id=notice and read_at is not null) then raise exception 'Cross-account write'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform studio_flow_client_read_marketing_notice(notice);
  if not exists(select 1 from client_notifications where id=notice and read_at is not null) then raise exception 'Mark read failed'; end if;
  if has_function_privilege('authenticated','public.studio_flow_generate_marketing_reminders(uuid,uuid,text)','execute') then raise exception 'Generator exposed'; end if;
  raise notice 'PASS: inbox and read isolation; private generator';
end $$;
rollback;
