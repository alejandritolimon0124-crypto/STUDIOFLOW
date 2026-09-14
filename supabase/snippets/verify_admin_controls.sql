-- Existing restored accounts only; no production changes or persistent data.
begin;
do $$
declare s record; actor uuid; artist uuid; result jsonb; month_start date; entity_sum numeric; rejected boolean:=false;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 for s in select * from public.studios where studio_status='approved' and archived_at is null loop
  perform set_config('request.jwt.claim.sub',s.owner_profile_id::text,true);
  perform public.studio_flow_hide_studio_marketplace(s.id);
  if exists(select 1 from public.marketplace_profiles where studio_id=s.id and visibility_status='visible') then raise exception 'Studio profile still visible'; end if;
  if exists(select 1 from public.marketplace_listings where studio_id=s.id and visibility_status='visible') then raise exception 'Studio listing still visible'; end if;
  result:=public.studio_flow_publish_studio_marketplace(s.id);
  if result->>'visibilityStatus'<>'visible' then raise exception 'Publication failed'; end if;
  if not exists(select 1 from public.marketplace_listings where studio_id=s.id and visibility_status='visible' and expires_at is null) then raise exception 'Publication remains expired'; end if;
  raise notice 'Studio hide/publish persistence passed';
 end loop;
 select p.id into actor from public.profiles p where p.status='active' and (p.default_role='platform_owner' or exists(select 1 from public.user_role_assignments u join public.roles r on r.id=u.role_id where u.profile_id=p.id and u.status='active' and r.code='platform_owner')) limit 1;
 select id into artist from public.artists where status='active' and archived_at is null order by public.studio_flow_artist_unpaid_commission(id) desc limit 1;
 if actor is null or artist is null then raise exception 'Existing owner and artist required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform public.studio_flow_admin_deactivate_artist(artist);
 if not exists(select 1 from public.artists where id=artist and status='inactive') then raise exception 'Artist suspension failed'; end if;
 result:=public.studio_flow_admin_get_billing_summary(null::date,''::text);
 if not exists(select 1 from jsonb_array_elements(result->'entities') e where e->>'id'=artist::text and e->>'type'='artist') then
  raise exception 'Suspended artist disappeared from billing';
 end if;
 if public.studio_flow_artist_unpaid_commission(artist)>0 then
  begin
   perform public.studio_flow_admin_activate_artist(artist);
  exception when others then
   if sqlerrm not like 'No se puede reactivar:%' then raise; end if;
   rejected:=true;
  end;
  if not rejected then raise exception 'Unpaid artist reactivated'; end if;
  perform public.studio_flow_admin_mark_commission_paid('artist',artist,current_date,'manual',null);
  if public.studio_flow_artist_unpaid_commission(artist)<>0 then raise exception 'Payment not reflected'; end if;
  raise notice 'Debt blocks activation; recorded payment clears debt';
 end if;
 perform public.studio_flow_admin_activate_artist(artist);
 if not exists(select 1 from public.artists where id=artist and status='active') then raise exception 'Artist reactivation failed'; end if;
 result:=public.studio_flow_admin_get_billing_summary(null::date,''::text);
 if result is null then raise exception 'Billing summary missing'; end if;
 for month_start in select distinct date_trunc('month',starts_at)::date from public.appointments loop
  result:=public.studio_flow_admin_get_billing_summary(month_start,''::text);
  select sum((e->>'currentMonthCommission')::numeric) into entity_sum from jsonb_array_elements(result->'entities') e;
  if entity_sum>(result->>'currentMonthCommission')::numeric then
   raise warning 'CONFIRMED: billing entity commissions exceed global total in %',month_start;
  end if;
 end loop;
 raise notice 'Owner suspension/reactivation and billing summary call passed';
end;$$;
rollback;
