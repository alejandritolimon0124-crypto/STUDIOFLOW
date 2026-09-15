begin;
do $$ begin
  if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
end $$;
select set_config('request.jwt.claim.sub',(
  select c.profile_id::text from clients c join profiles p on p.id=c.profile_id
  where c.status='active' and p.status='active' and p.default_role='client'
  and not exists(select 1 from studios s where s.owner_profile_id=p.id)
  limit 1),true) is not null as client_selected;
set local role authenticated;
do $$
declare n integer; result jsonb;
begin
  if auth.uid() is null then raise exception 'Existing client required'; end if;
  if exists(select 1 from clients where profile_id is distinct from auth.uid()) then raise exception 'Other client exposed'; end if;
  if not exists(select 1 from clients where profile_id=auth.uid()) then raise exception 'Own client unavailable'; end if;
  if exists(select 1 from appointments a where not exists(select 1 from clients c where c.id=a.client_id and c.profile_id=auth.uid())) then raise exception 'Other appointment exposed'; end if;
  update studio_profiles set description=description;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Foreign studio updated'; end if;
  begin
    perform studio_flow_assign_role(auth.uid(),'platform_owner',null);
    raise exception 'Role assignment permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform studio_flow_bootstrap_profile(null,null,'platform_owner');
    raise exception 'Privileged bootstrap permitted';
  exception when insufficient_privilege then null;
  end;
  perform studio_flow_bootstrap_profile(null,null,'client');
  result:=studio_flow_get_own_client_profile();
  if result is null then raise exception 'Own profile unavailable'; end if;
  perform studio_flow_marketplace_get_listings();
  raise notice 'PASS: client isolation, own profile, marketplace, safe bootstrap and privilege rejection';
end $$;
reset role;
select set_config('request.jwt.claim.sub',(
  select s.owner_profile_id::text from studios s join profiles p on p.id=s.owner_profile_id
  where s.archived_at is null and p.status='active' limit 1),true) is not null as studio_owner_selected;
set local role authenticated;
do $$
declare n integer; s uuid;
begin
  if auth.uid() is null then raise exception 'Existing studio owner required'; end if;
  s:=studio_flow_owner_assert_studio_access(null);
  update studio_profiles set description=description where studio_id=s;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Own studio update rejected'; end if;
  insert into studio_profiles(studio_id,commercial_name)
    select studio_id,commercial_name from studio_profiles where studio_id=s
    on conflict(studio_id) do update set commercial_name=excluded.commercial_name;
  if not exists(select 1 from appointments where studio_id=s) then raise exception 'Studio appointments unavailable'; end if;
  if exists(select 1 from appointments where studio_id is distinct from s
    and not studio_flow_security_appointment(client_id,artist_id,studio_id)) then raise exception 'Unrelated appointment exposed'; end if;
  perform a.id,c.id,so.id from appointments a join clients c on c.id=a.client_id
    join artists ar on ar.id=a.artist_id join service_offerings so on so.id=a.service_offering_id where a.studio_id=s;
  get diagnostics n=row_count;
  if n=0 then raise exception 'Studio appointment related data unavailable'; end if;
  raise notice 'PASS: studio owner reads appointment relations and can update/upsert own profile';
end $$;
reset role;
select set_config('request.jwt.claim.sub',(
  select p.id::text from profiles p where p.status='active' and p.default_role='platform_owner' limit 1
),true) is not null as owner_selected;
set local role authenticated;
do $$ begin
  if not studio_flow_security_is_owner() then raise exception 'Existing platform owner required'; end if;
  perform studio_flow_admin_get_billing_summary(null::date,''::text);
  perform studio_flow_admin_get_clients();
  if not exists(select 1 from clients) then raise exception 'Owner client access blocked'; end if;
  raise notice 'PASS: platform owner retains billing and client access';
end $$;
reset role;
-- Temporarily suspend an existing client, then check with that real account identity.
select set_config('request.jwt.claim.sub',(select profile_id::text from clients where status='active' and profile_id is not null limit 1),true) is not null;
update profiles set status='suspended' where id=auth.uid();
set local role authenticated;
do $$ begin
  if exists(select 1 from appointments) or exists(select 1 from clients) or exists(select 1 from studio_profiles) then
    raise exception 'Inactive profile retained direct access';
  end if;
  raise notice 'PASS: inactive profile cannot read protected tables';
end $$;
rollback;
