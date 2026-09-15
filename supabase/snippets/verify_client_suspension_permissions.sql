begin;
do $$ begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
end $$;
select set_config('audit.client',(select id::text from clients where status='active' and profile_id is not null limit 1),true) is not null;
select set_config('request.jwt.claim.sub',(select owner_profile_id::text from studios where archived_at is null limit 1),true) is not null;
set local role authenticated;
do $$ declare action text; rejected boolean;
begin
 if auth.uid() is null or studio_flow_security_is_owner() then raise exception 'Non-platform studio owner required'; end if;
 foreach action in array array['studio_flow_admin_activate_client','studio_flow_admin_deactivate_client'] loop
   rejected:=false;
   begin
     execute format('select public.%I($1)',action) using current_setting('audit.client')::uuid;
   exception when others then
     if sqlerrm<>'Platform owner role required' then raise; end if;
     rejected:=true;
   end;
   if not rejected then raise exception 'Studio owner changed global client status'; end if;
 end loop;
 raise notice 'PASS: studio owner cannot activate or suspend clients';
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from profiles where default_role='platform_owner' and status='active' limit 1),true) is not null;
set local role authenticated;
select public.studio_flow_admin_deactivate_client(current_setting('audit.client')::uuid) is not null as owner_suspension_works;
reset role;
select set_config('request.jwt.claim.sub',(select profile_id::text from clients where id=current_setting('audit.client')::uuid),true) is not null;
set local role authenticated;
do $$ declare rejected boolean:=false;
begin
 begin
   perform studio_flow_update_own_client_profile('{}'::jsonb);
 exception when others then
   if sqlerrm<>'Client profile required' then raise; end if;
   rejected:=true;
 end;
 if not rejected then raise exception 'Suspended client edited profile'; end if;
 raise notice 'PASS: suspended client cannot edit profile with existing identity';
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from profiles where default_role='platform_owner' and status='active' limit 1),true) is not null;
set local role authenticated;
select studio_flow_admin_activate_client(current_setting('audit.client')::uuid) is not null as owner_reactivation_works;
rollback;
