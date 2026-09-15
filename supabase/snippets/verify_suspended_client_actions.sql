begin;
do $$ begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
end $$;
select set_config('audit.client',(select id::text from clients where status='active' and profile_id is not null limit 1),true) is not null;
select set_config('audit.artist',(select id::text from artists where status='active' limit 1),true) is not null;
select set_config('audit.service',(select id::text from service_offerings where status='active' limit 1),true) is not null;
select set_config('audit.slot',(select id::text from availability_slots limit 1),true) is not null;
select set_config('request.jwt.claim.sub',(select profile_id::text from clients where id=current_setting('audit.client')::uuid),true) is not null;
update clients set status='inactive' where id=current_setting('audit.client')::uuid;
set local role authenticated;
do $$ declare command text; rejected boolean;
begin
 foreach command in array array[
   'select public.studio_flow_marketplace_book_appointment(array[current_setting(''audit.slot'')::uuid],current_setting(''audit.service'')::uuid,null)',
   'select public.studio_flow_client_apply_appointment_reward(null,null)',
   'select public.studio_flow_client_redeem_flow_points(1,current_setting(''audit.artist'')::uuid,null)'
 ] loop
   rejected:=false;
   begin execute command;
   exception when others then
     if sqlerrm not in ('Active client required','Client profile required') then raise; end if;
     rejected:=true;
   end;
   if not rejected then raise exception 'Suspended client action accepted'; end if;
 end loop;
 raise notice 'PASS: suspended client cannot book, apply appointment reward or redeem points with retained identity';
end $$;
reset role;
select set_config('audit.appointment',a.id::text,true) is not null,
  set_config('audit.studio',s.id::text,true) is not null,
  set_config('request.jwt.claim.sub',s.owner_profile_id::text,true) is not null
from appointments a join studios s on s.id=a.studio_id
where a.status in ('scheduled','completed') limit 1;
update studios set studio_status='suspended' where id=current_setting('audit.studio')::uuid;
update artists set status='inactive' where id=(select artist_id from appointments where id=current_setting('audit.appointment')::uuid);
set local role authenticated;
do $$ declare rejected boolean:=false;
begin
 begin
   perform studio_flow_artist_award_appointment_points(current_setting('audit.appointment')::uuid);
 exception when others then
   if sqlerrm<>'Artist scope does not allow awarding points' then raise; end if;
   rejected:=true;
 end;
 if not rejected then raise exception 'Suspended studio/artist could award points'; end if;
 raise notice 'PASS: suspended studio with inactive artist cannot award points';
end $$;
rollback;
