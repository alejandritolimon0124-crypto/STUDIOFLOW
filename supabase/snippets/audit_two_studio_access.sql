\set ON_ERROR_STOP on
begin;
do $$
declare first_studio uuid; first_owner uuid; second_studio uuid; second_owner uuid;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
 select id,owner_profile_id into strict first_studio,first_owner from studios where archived_at is null limit 1;
 select p.id into strict second_owner from profiles p where p.status='active' and p.id<>first_owner
 and p.default_role<>'platform_owner'
 and not exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id where u.profile_id=p.id and u.status='active' and r.code in ('platform_owner','studio_owner','studio_manager')) limit 1;
 insert into studios(owner_profile_id,name,studio_status) values(second_owner,'Isolated second studio','approved') returning id into second_studio;
 perform set_config('audit.first_studio',first_studio::text,true);
 perform set_config('audit.second_studio',second_studio::text,true);
 perform set_config('audit.first_owner',first_owner::text,true);
 perform set_config('audit.second_owner',second_owner::text,true);
end;$$;
set local role authenticated;
do $$
declare actor uuid; own_studio uuid; other_studio uuid; denied boolean; n integer; direction integer;
begin
 for direction in 1..2 loop
  actor:=current_setting(case when direction=1 then 'audit.first_owner' else 'audit.second_owner' end)::uuid;
  own_studio:=current_setting(case when direction=1 then 'audit.first_studio' else 'audit.second_studio' end)::uuid;
  other_studio:=current_setting(case when direction=1 then 'audit.second_studio' else 'audit.first_studio' end)::uuid;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if studio_flow_owner_assert_studio_access(own_studio)<>own_studio then raise exception 'FAIL: own access'; end if;
  perform studio_flow_owner_get_studio_memberships(own_studio);
  denied:=false;
  begin
   perform studio_flow_owner_get_studio_memberships(other_studio);
  exception when others then
   if sqlerrm not like '%Studio owner access required%' then raise; end if;
   denied:=true;
  end;
  if not denied then raise exception 'FAIL: foreign team visible'; end if;
  denied:=false;
  begin
   perform studio_flow_owner_get_membership_operations(other_studio,null);
  exception when others then
   if sqlerrm not like '%Studio owner access required%' then raise; end if;
   denied:=true;
  end;
  if not denied then raise exception 'FAIL: foreign operations visible'; end if;
  begin
   update studios set name=name where id=other_studio;
   get diagnostics n=row_count;
   if n<>0 then raise exception 'FAIL: foreign studio writable'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS direction %: own team allowed, foreign team and operations denied, foreign studio update denied',direction;
 end loop;
end;$$;
rollback;
