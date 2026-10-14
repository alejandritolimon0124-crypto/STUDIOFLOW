create or replace function public.studio_flow_campaign_set_status(p_campaign_id uuid,p_status text)
returns public.registration_campaigns language plpgsql security definer set search_path=public as $$
declare v_campaign public.registration_campaigns;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  if p_status not in ('active','draft') then raise exception 'Estado de campaña inválido'; end if;
  update public.registration_campaigns set status=p_status,updated_at=now()
  where id=p_campaign_id returning * into v_campaign;
  return v_campaign;
end $$;

revoke all on function public.studio_flow_campaign_set_status(uuid,text) from public;
grant execute on function public.studio_flow_campaign_set_status(uuid,text) to authenticated;
