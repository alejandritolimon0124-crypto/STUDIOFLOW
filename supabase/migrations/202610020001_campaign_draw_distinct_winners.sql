create or replace function public.studio_flow_campaign_draw(p_campaign_id uuid, p_raffle_type text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing public.campaign_raffle_draws;
  v_participant public.campaign_participants;
  v_draw public.campaign_raffle_draws;
begin
  if p_raffle_type not in ('visitors','clients') then
    raise exception 'Tipo de rifa inválido';
  end if;

  if not public.studio_flow_can_manage_campaign(p_campaign_id) then
    raise exception 'Campaign owner access required';
  end if;

  select * into v_existing
  from public.campaign_raffle_draws
  where campaign_id = p_campaign_id and raffle_type = p_raffle_type;

  if found then
    select * into v_participant
    from public.campaign_participants
    where id = v_existing.participant_id;
    return jsonb_build_object(
      'participant', to_jsonb(v_participant),
      'draw', to_jsonb(v_existing),
      'alreadyDrawn', true
    );
  end if;

  select p.* into v_participant
  from public.campaign_participants p
  where p.campaign_id = p_campaign_id
    and (p_raffle_type = 'visitors' or p.hired = true)
    and not exists (
      select 1 from public.campaign_raffle_draws previous
      where previous.campaign_id = p_campaign_id
        and previous.participant_id = p.id
    )
  order by random()
  limit 1;

  if not found then
    raise exception 'No hay participantes elegibles sin premio previo para este sorteo.';
  end if;

  insert into public.campaign_raffle_draws (
    campaign_id, raffle_type, participant_id, drawn_by_profile_id
  ) values (
    p_campaign_id, p_raffle_type, v_participant.id, auth.uid()
  ) returning * into v_draw;

  return jsonb_build_object(
    'participant', to_jsonb(v_participant),
    'draw', to_jsonb(v_draw),
    'alreadyDrawn', false
  );
end $$;

revoke all on function public.studio_flow_campaign_draw(uuid,text) from public;
grant execute on function public.studio_flow_campaign_draw(uuid,text) to authenticated;
