create or replace function public.studio_flow_campaign_update(
  p_campaign_id uuid,p_name text,p_event_name text,p_description text,p_welcome_text text,
  p_starts_at timestamptz,p_ends_at timestamptz
) returns public.registration_campaigns language plpgsql security definer set search_path=public as $$
declare v_campaign public.registration_campaigns;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  if length(trim(coalesce(p_name,'')))<3 then raise exception 'Escribe el nombre de la campaña'; end if;
  if length(trim(coalesce(p_event_name,'')))<3 then raise exception 'Escribe el nombre del evento'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'El término debe ser posterior al inicio'; end if;
  update public.registration_campaigns set
    name=left(trim(p_name),160),event_name=left(trim(p_event_name),160),
    description=nullif(trim(p_description),''),welcome_text=nullif(trim(p_welcome_text),''),
    event_date=(p_starts_at at time zone 'America/Mexico_City')::date,
    starts_at=p_starts_at,ends_at=p_ends_at,updated_at=now()
  where id=p_campaign_id returning * into v_campaign;
  return v_campaign;
end $$;

revoke all on function public.studio_flow_campaign_update(uuid,text,text,text,text,timestamptz,timestamptz) from public;
grant execute on function public.studio_flow_campaign_update(uuid,text,text,text,text,timestamptz,timestamptz) to authenticated;
