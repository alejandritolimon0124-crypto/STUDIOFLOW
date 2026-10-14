create or replace function public.studio_flow_campaign_update_raffles(p_campaign_id uuid,p_raffles jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_raffle public.campaign_raffles; v_group text; v_channel_id uuid; v_event_type text; v_winners integer; v_draws integer;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  if jsonb_typeof(coalesce(p_raffles,'[]'::jsonb))<>'array' then raise exception 'Premios inválidos'; end if;
  for v_item in select value from jsonb_array_elements(p_raffles) loop
    select * into v_raffle from public.campaign_raffles where id=(v_item->>'id')::uuid and campaign_id=p_campaign_id;
    if not found then raise exception 'Premio no encontrado'; end if;
    if length(trim(v_item->>'name'))<3 then raise exception 'Cada premio necesita un nombre'; end if;
    v_group:=coalesce(v_item->>'groupType','all');
    if v_group not in ('all','channel','hired','not_hired','event_type','hired_event_type') then raise exception 'Grupo de sorteo inválido'; end if;
    v_channel_id:=null; v_event_type:=null;
    if v_group='channel' then
      v_channel_id:=(v_item->>'channelId')::uuid;
      if not exists(select 1 from public.campaign_channels where id=v_channel_id and campaign_id=p_campaign_id) then raise exception 'Canal inválido'; end if;
    elsif v_group in ('event_type','hired_event_type') then
      v_event_type:=nullif(trim(v_item->>'eventType'),'');
      if v_event_type is null then raise exception 'Selecciona un tipo de evento'; end if;
    end if;
    v_winners:=least(20,greatest(1,coalesce((v_item->>'winnerCount')::integer,1)));
    select count(*) into v_draws from public.campaign_raffle_draws where raffle_id=v_raffle.id;
    if v_winners<v_draws then raise exception 'El número de ganadoras no puede ser menor a los sorteos ya realizados'; end if;
    update public.campaign_raffles set name=left(trim(v_item->>'name'),160),group_type=v_group,
      channel_id=v_channel_id,event_type=v_event_type,winner_count=v_winners,
      allow_repeat=coalesce((v_item->>'allowRepeat')::boolean,false)
    where id=v_raffle.id;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'name',r.name,'group_type',r.group_type,'channel_id',r.channel_id,'event_type',r.event_type,
    'group_label',case r.group_type when 'all' then 'Todas las participantes' when 'hired' then 'Solo quienes contrataron' when 'not_hired' then 'Solo registradas que no contrataron' when 'event_type' then 'Evento: '||r.event_type when 'hired_event_type' then 'Contrataron: '||r.event_type else coalesce(ch.name,'Canal') end,
    'winner_count',r.winner_count,'allow_repeat',r.allow_repeat,'position',r.position,
    'draw_count',(select count(*) from public.campaign_raffle_draws d where d.raffle_id=r.id)
  ) order by r.position) from public.campaign_raffles r left join public.campaign_channels ch on ch.id=r.channel_id where r.campaign_id=p_campaign_id),'[]'::jsonb);
end $$;

revoke all on function public.studio_flow_campaign_update_raffles(uuid,jsonb) from public;
grant execute on function public.studio_flow_campaign_update_raffles(uuid,jsonb) to authenticated;
