create or replace function public.studio_flow_campaign_delete(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_campaign public.registration_campaigns;
  v_participant_count integer;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then
    raise exception 'Campaign owner access required';
  end if;

  select * into v_campaign
  from public.registration_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campaña no encontrada';
  end if;

  select count(*) into v_participant_count
  from public.campaign_participants
  where campaign_id = p_campaign_id;

  delete from public.registration_campaigns where id = p_campaign_id;

  return jsonb_build_object(
    'deleted', true,
    'campaignId', p_campaign_id,
    'participantCount', v_participant_count
  );
end $$;

revoke all on function public.studio_flow_campaign_delete(uuid) from public;
grant execute on function public.studio_flow_campaign_delete(uuid) to authenticated;
