create function public.studio_flow_client_flow_point_destinations()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client_id uuid; v_result jsonb;
begin
  select id into v_client_id from public.clients where profile_id=auth.uid()
    and status='active' and archived_at is null;
  if v_client_id is null then raise exception 'Perfil de clienta requerido'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',target.id,'type',target.kind,
    'label',target.name,'availablePoints',target.available_points)
    order by target.available_points desc,target.name),'[]'::jsonb) into v_result
  from (
    select s.id,'studio'::text as kind,coalesce(sp.commercial_name,s.name) as name,
      public.studio_flow_client_points_balance_for_reward(v_client_id,null,s.id,true) as available_points
    from public.studios s left join public.studio_profiles sp on sp.studio_id=s.id
    where s.studio_status='approved' and s.archived_at is null
      and exists(select 1 from public.loyalty_accounts la
        join public.flow_point_ledger fpl on fpl.loyalty_account_id=la.id
        where la.client_id=v_client_id and fpl.movement_type='earn'
          and fpl.metadata->>'studioId'=s.id::text
          and coalesce(fpl.expires_at,fpl.occurred_at+interval '180 days')>now())
    union all
    select a.id,'artist'::text,coalesce(ap.artistic_name,a.display_name),
      public.studio_flow_client_points_balance_for_reward(v_client_id,a.id,null,true)
    from public.artists a left join public.artist_profiles ap on ap.artist_id=a.id
    where a.status='active' and a.archived_at is null
      and exists(select 1 from public.loyalty_accounts la
        join public.flow_point_ledger fpl on fpl.loyalty_account_id=la.id
        where la.client_id=v_client_id and fpl.movement_type='earn'
          and fpl.metadata->>'artistId'=a.id::text
          and nullif(fpl.metadata->>'studioId','') is null
          and coalesce(fpl.expires_at,fpl.occurred_at+interval '180 days')>now())
  ) target where target.available_points>0;
  return v_result;
end $$;
revoke all on function public.studio_flow_client_flow_point_destinations() from public,anon;
grant execute on function public.studio_flow_client_flow_point_destinations() to authenticated;

create function public.studio_flow_client_flow_point_redemptions()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client_id uuid; v_result jsonb;
begin
  select id into v_client_id from public.clients where profile_id=auth.uid()
    and status='active' and archived_at is null;
  if v_client_id is null then raise exception 'Perfil de clienta requerido'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'points',r.points,
    'redeemedAt',r.redeemed_at,'businessName',
      case when r.studio_id is not null then coalesce(sp.commercial_name,s.name)
        else coalesce(ap.artistic_name,a.display_name) end)
    order by r.redeemed_at desc),'[]'::jsonb) into v_result
  from (select * from public.flow_point_redemptions where client_id=v_client_id
    order by redeemed_at desc limit 10) r
  left join public.studios s on s.id=r.studio_id
  left join public.studio_profiles sp on sp.studio_id=s.id
  left join public.artists a on a.id=r.artist_id
  left join public.artist_profiles ap on ap.artist_id=a.id;
  return v_result;
end $$;
revoke all on function public.studio_flow_client_flow_point_redemptions() from public,anon;
grant execute on function public.studio_flow_client_flow_point_redemptions() to authenticated;

create function public.studio_flow_business_flow_point_redemptions(p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist_id uuid; v_result jsonb;
begin
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id=auth.uid()
      and status='active' and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil de artista requerido'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'clientName',c.display_name,
    'points',r.points,'redeemedAt',r.redeemed_at)
    order by r.redeemed_at desc),'[]'::jsonb) into v_result
  from (select * from public.flow_point_redemptions
    where (p_studio_id is not null and studio_id=p_studio_id)
      or (v_artist_id is not null and artist_id=v_artist_id)
    order by redeemed_at desc limit 30) r
  join public.clients c on c.id=r.client_id;
  return v_result;
end $$;
revoke all on function public.studio_flow_business_flow_point_redemptions(uuid) from public,anon;
grant execute on function public.studio_flow_business_flow_point_redemptions(uuid) to authenticated;
