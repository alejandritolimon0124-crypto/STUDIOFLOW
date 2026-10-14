create function public.studio_flow_owner_find_existing_client(
  p_studio_id uuid, p_phone text default null, p_email text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client clients%rowtype;
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  if nullif(public.studio_flow_phone_key(p_phone),'') is null
    and nullif(trim(coalesce(p_email,'')),'') is null then return null; end if;
  select * into v_client from clients c
  where (length(public.studio_flow_phone_key(p_phone))=10
      and public.studio_flow_phone_key(c.phone)=public.studio_flow_phone_key(p_phone))
     or (nullif(trim(coalesce(p_email,'')),'') is not null
      and lower(trim(c.email))=lower(trim(p_email)))
  order by case when lower(trim(c.email))=lower(trim(coalesce(p_email,''))) then 0 else 1 end,
    c.created_at desc limit 1;
  if v_client.id is null then return null; end if;
  return jsonb_build_object('id',v_client.id,'display_name',v_client.display_name,
    'phone',v_client.phone,'email',v_client.email,'status',v_client.status);
end $$;
revoke all on function public.studio_flow_owner_find_existing_client(uuid,text,text) from public,anon;
grant execute on function public.studio_flow_owner_find_existing_client(uuid,text,text) to authenticated;

create function public.studio_flow_owner_create_manual_appointment_checked(
  p_studio_id uuid, p_membership_id uuid, p_service_offering_id uuid,
  p_availability_slot_id uuid, p_client_id uuid default null,
  p_client_name text default null, p_client_phone text default null,
  p_client_email text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_match jsonb;
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  v_match:=public.studio_flow_owner_find_existing_client(p_studio_id,p_client_phone,p_client_email);
  if v_match is not null and p_client_id is distinct from (v_match->>'id')::uuid then
    raise exception 'Esta clienta ya forma parte de Studio Flow. Usa su perfil para agendar.';
  end if;
  return public.studio_flow_owner_create_manual_appointment(
    p_studio_id,p_membership_id,p_service_offering_id,p_availability_slot_id,
    p_client_id,p_client_name,p_client_phone,p_client_email,p_notes);
end $$;
revoke all on function public.studio_flow_owner_create_manual_appointment_checked(uuid,uuid,uuid,uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.studio_flow_owner_create_manual_appointment_checked(uuid,uuid,uuid,uuid,uuid,text,text,text,text) to authenticated;
