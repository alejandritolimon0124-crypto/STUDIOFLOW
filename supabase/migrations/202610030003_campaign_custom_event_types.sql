create or replace function public.studio_flow_campaign_set_event_types(
  p_campaign_id uuid,
  p_event_types jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_item jsonb;
  v_clean jsonb := '[]'::jsonb;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then
    raise exception 'Campaign owner access required';
  end if;
  if jsonb_typeof(coalesce(p_event_types,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_event_types,'[]'::jsonb))<1
     or jsonb_array_length(coalesce(p_event_types,'[]'::jsonb))>12 then
    raise exception 'Agrega entre 1 y 12 tipos de evento';
  end if;

  for v_item in select value from jsonb_array_elements(p_event_types) loop
    if length(trim(v_item#>>'{}'))<2 then
      raise exception 'Completa todos los tipos de evento';
    end if;
    v_clean:=v_clean || jsonb_build_array(left(trim(v_item#>>'{}'),80));
  end loop;

  update public.registration_campaigns
  set form_config=coalesce(form_config,'{}'::jsonb) || jsonb_build_object('eventTypes',v_clean),
      updated_at=now()
  where id=p_campaign_id;

  return jsonb_build_object('ok',true,'eventTypes',v_clean);
end $$;

revoke all on function public.studio_flow_campaign_set_event_types(uuid,jsonb) from public;
grant execute on function public.studio_flow_campaign_set_event_types(uuid,jsonb) to authenticated;
