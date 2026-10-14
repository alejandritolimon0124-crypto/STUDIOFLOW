alter table public.campaign_raffles add column if not exists event_type text;
alter table public.campaign_raffles drop constraint if exists campaign_raffles_group_type_check;
alter table public.campaign_raffles drop constraint if exists campaign_raffles_check;
alter table public.campaign_raffles add constraint campaign_raffles_group_type_check
  check(group_type in ('all','channel','hired','not_hired','event_type'));
alter table public.campaign_raffles add constraint campaign_raffles_filter_target_check
  check(
    (group_type='channel' and channel_id is not null and event_type is null)
    or (group_type='event_type' and channel_id is null and nullif(trim(event_type),'') is not null)
    or (group_type in ('all','hired','not_hired') and channel_id is null and event_type is null)
  );

create or replace function public.studio_flow_campaign_set_raffle_filters(p_campaign_id uuid,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_group text; v_channel_id uuid; v_event_type text; v_position integer;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  if jsonb_typeof(coalesce(p_filters,'[]'::jsonb))<>'array' then raise exception 'Filtros de premios inválidos'; end if;
  for v_item in select value from jsonb_array_elements(p_filters) loop
    v_position:=(v_item->>'position')::integer;
    v_group:=coalesce(v_item->>'groupType','all');
    if v_group not in ('all','channel','hired','not_hired','event_type') then raise exception 'Grupo de sorteo inválido'; end if;
    v_channel_id:=null; v_event_type:=null;
    if v_group='channel' then
      select id into v_channel_id from public.campaign_channels where campaign_id=p_campaign_id and slug=v_item->>'channelSlug';
      if v_channel_id is null then raise exception 'Selecciona un canal válido para el premio'; end if;
    elsif v_group='event_type' then
      v_event_type:=nullif(trim(v_item->>'eventType'),'');
      if v_event_type is null then raise exception 'Selecciona un tipo de evento para el premio'; end if;
    end if;
    update public.campaign_raffles set group_type=v_group,channel_id=v_channel_id,event_type=v_event_type
    where campaign_id=p_campaign_id and position=v_position;
    if not found then raise exception 'Premio no encontrado'; end if;
  end loop;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.studio_flow_campaign_dashboard(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  return jsonb_build_object(
    'channels',coalesce((select jsonb_agg(to_jsonb(ch) order by ch.position) from public.campaign_channels ch where ch.campaign_id=p_campaign_id),'[]'::jsonb),
    'raffles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.name,'group_type',r.group_type,'channel_id',r.channel_id,'event_type',r.event_type,
      'group_label',case r.group_type when 'all' then 'Todas las participantes' when 'hired' then 'Solo quienes contrataron' when 'not_hired' then 'Solo registradas que no contrataron' when 'event_type' then 'Evento: '||r.event_type else coalesce(ch.name,'Canal') end,
      'winner_count',r.winner_count,'allow_repeat',r.allow_repeat,'position',r.position,
      'draw_count',(select count(*) from public.campaign_raffle_draws d where d.raffle_id=r.id)
    ) order by r.position) from public.campaign_raffles r left join public.campaign_channels ch on ch.id=r.channel_id where r.campaign_id=p_campaign_id),'[]'::jsonb)
  );
end $$;

create or replace function public.studio_flow_campaign_draw_raffle(p_campaign_id uuid,p_raffle_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_raffle public.campaign_raffles; v_participant public.campaign_participants; v_draw public.campaign_raffle_draws; v_draw_count integer;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  select * into v_raffle from public.campaign_raffles where id=p_raffle_id and campaign_id=p_campaign_id for update;
  if not found then raise exception 'Sorteo no encontrado'; end if;
  select count(*) into v_draw_count from public.campaign_raffle_draws where raffle_id=v_raffle.id;
  if v_draw_count>=v_raffle.winner_count then
    select p.* into v_participant from public.campaign_raffle_draws d join public.campaign_participants p on p.id=d.participant_id where d.raffle_id=v_raffle.id order by d.winner_position desc limit 1;
    return jsonb_build_object('participant',to_jsonb(v_participant),'alreadyDrawn',true,'completed',true);
  end if;
  select p.* into v_participant from public.campaign_participants p
  where p.campaign_id=p_campaign_id
    and (v_raffle.group_type='all'
      or (v_raffle.group_type='hired' and p.hired)
      or (v_raffle.group_type='not_hired' and not p.hired)
      or (v_raffle.group_type='channel' and p.source_channel_id=v_raffle.channel_id)
      or (v_raffle.group_type='event_type' and p.event_type=v_raffle.event_type))
    and not exists(select 1 from public.campaign_raffle_draws own where own.raffle_id=v_raffle.id and own.participant_id=p.id)
    and (v_raffle.allow_repeat or not exists(select 1 from public.campaign_raffle_draws previous where previous.campaign_id=p_campaign_id and previous.participant_id=p.id))
  order by random() limit 1;
  if not found then raise exception 'No hay participantes elegibles sin premio previo para este sorteo.'; end if;
  insert into public.campaign_raffle_draws(campaign_id,raffle_id,participant_id,drawn_by_profile_id,winner_position)
  values(p_campaign_id,v_raffle.id,v_participant.id,auth.uid(),v_draw_count+1) returning * into v_draw;
  return jsonb_build_object('participant',to_jsonb(v_participant),'draw',to_jsonb(v_draw),'alreadyDrawn',false,'completed',v_draw_count+1>=v_raffle.winner_count);
end $$;

revoke all on function public.studio_flow_campaign_set_raffle_filters(uuid,jsonb) from public;
grant execute on function public.studio_flow_campaign_set_raffle_filters(uuid,jsonb) to authenticated;
