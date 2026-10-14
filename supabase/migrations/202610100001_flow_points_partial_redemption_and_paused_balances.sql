begin;

create or replace function public.studio_flow_client_flow_point_destinations()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client_id uuid; v_result jsonb;
begin
  select id into v_client_id from public.clients where profile_id=auth.uid()
    and status='active' and archived_at is null;
  if v_client_id is null then raise exception 'Perfil de clienta requerido'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',target.id,'type',target.kind,
    'label',target.name,'availablePoints',target.available_points,'redeemable',target.redeemable)
    order by target.available_points desc,target.name),'[]'::jsonb) into v_result
  from (
    select s.id,'studio'::text as kind,coalesce(sp.commercial_name,s.name) as name,
      public.studio_flow_client_points_balance_for_reward(v_client_id,null,s.id,true) as available_points,
      (s.studio_status='approved' and s.archived_at is null) as redeemable
    from public.studios s left join public.studio_profiles sp on sp.studio_id=s.id
    where exists(select 1 from public.loyalty_accounts la
      join public.flow_point_ledger fpl on fpl.loyalty_account_id=la.id
      where la.client_id=v_client_id and fpl.movement_type='earn'
        and fpl.metadata->>'studioId'=s.id::text
        and coalesce(fpl.expires_at,fpl.occurred_at+interval '180 days')>now())
    union all
    select a.id,'artist'::text,coalesce(ap.artistic_name,a.display_name),
      public.studio_flow_client_points_balance_for_reward(v_client_id,a.id,null,true),
      (a.status='active' and a.archived_at is null)
    from public.artists a left join public.artist_profiles ap on ap.artist_id=a.id
    where exists(select 1 from public.loyalty_accounts la
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

do $$
declare definition text;
begin
  select pg_get_functiondef('public.studio_flow_client_redeem_flow_points(integer,uuid,uuid)'::regprocedure) into definition;
  if position('if v_points < 1000 then' in definition)=0
    or position('if v_points > v_balance then' in definition)=0 then
    raise exception 'Unexpected article redemption function';
  end if;
  definition:=replace(definition,
    'if v_points < 1000 then raise exception ''Los beneficios comienzan a partir de 1,000 Flow Points.''; end if;',
    'if v_points < 100 or v_points % 100 <> 0 then raise exception ''Usa al menos 100 Flow Points en multiplos de 100.''; end if;');
  definition:=replace(definition,
    'if v_points > v_balance then',
    'if v_balance < 1000 then raise exception ''Necesitas reunir 1,000 Flow Points con este negocio antes de cada canje.''; end if;
  if v_points > v_balance then');
  execute definition;

  select pg_get_functiondef('public.studio_flow_client_apply_appointment_points(uuid,integer)'::regprocedure) into definition;
  if position('if coalesce(p_points_to_use,0)<1000 or p_points_to_use%10<>0' in definition)=0
    or position('if p_points_to_use>v_balance then' in definition)=0
    or position('if v_appointment.id is null then raise exception ''Appointment not available for reward''; end if;' in definition)=0 then
    raise exception 'Unexpected appointment redemption function';
  end if;
  definition:=replace(definition,
    'if coalesce(p_points_to_use,0)<1000 or p_points_to_use%10<>0 then raise exception ''Selecciona al menos 1,000 FlowPoints en multiplos de 10.''; end if;',
    'if coalesce(p_points_to_use,0)<100 or p_points_to_use%100<>0 then raise exception ''Selecciona al menos 100 FlowPoints en multiplos de 100.''; end if;');
  definition:=replace(definition,
    'if p_points_to_use>v_balance then',
    'if v_balance<1000 then raise exception ''Necesitas reunir 1,000 FlowPoints con este negocio antes de cada descuento.''; end if;
 if p_points_to_use>v_balance then');
  definition:=replace(definition,
    'if v_appointment.id is null then raise exception ''Appointment not available for reward''; end if;',
    'if v_appointment.id is null then raise exception ''Appointment not available for reward''; end if;
 if v_appointment.studio_id is not null then
  perform 1 from public.studios s where s.id=v_appointment.studio_id
    and s.studio_status=''approved'' and s.archived_at is null for share;
  if not found then raise exception ''Los puntos de este estudio estan en pausa mientras permanezca suspendido.''; end if;
 end if;');
  execute definition;
end $$;

commit;
