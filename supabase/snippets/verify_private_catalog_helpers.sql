begin;
do $$
declare f text; r text;
begin
  if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
  foreach f in array array[
    'public.studio_flow_artist_get_or_create_service_category(text)',
    'public.studio_flow_artist_get_or_create_service_tier(text)',
    'public.studio_flow_artist_service_to_json(uuid)',
    'public.studio_flow_client_points_balance_for_reward(uuid,uuid,uuid,boolean)'
  ] loop
    foreach r in array array['anon','authenticated'] loop
      if has_function_privilege(r,f,'EXECUTE') then raise exception 'Helper exposed: % / %',r,f; end if;
    end loop;
  end loop;
  raise notice 'PASS: four catalog/reward helpers reject direct API access';
end $$;
select set_config('audit.service',s.id::text,true) is not null,
  set_config('request.jwt.claim.sub',a.profile_id::text,true) is not null
from service_offerings s join artists a on a.id=s.artist_id join profiles p on p.id=a.profile_id
where s.owner_type='artist' and s.status='active' and a.status='active' and p.status='active' limit 1;
set local role authenticated;
do $$ begin
  if auth.uid() is null then raise exception 'Existing artist required'; end if;
  perform studio_flow_artist_get_service_offerings(null,false);
  perform studio_flow_artist_update_service_offering(current_setting('audit.service')::uuid,'{}'::jsonb);
  raise notice 'PASS: authorized service listing and update still work';
end $$;
rollback;
