create function public.studio_flow_owner_create_manual_appointment_with_contact_validation(
  p_studio_id uuid,p_membership_id uuid,p_service_offering_id uuid,
  p_availability_slot_id uuid,p_client_id uuid default null,
  p_client_name text default null,p_client_phone text default null,
  p_client_email text default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_email text:=lower(trim(coalesce(p_client_email,'')));
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  if p_client_id is null and v_email<>'' then
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Escribe un correo válido o déjalo vacío.';
    end if;
    if exists(select 1 from public.clients c
      join public.profiles p on p.id=c.profile_id
      where lower(trim(c.email))=v_email
        and public.studio_flow_phone_key(coalesce(nullif(c.phone,''),p.phone))
          <>public.studio_flow_phone_key(p_client_phone)) then
      raise exception 'El correo no coincide con el teléfono de esa cuenta. Confirma los datos con la clienta.';
    end if;
  end if;
  return public.studio_flow_owner_create_manual_appointment_checked(
    p_studio_id,p_membership_id,p_service_offering_id,p_availability_slot_id,
    p_client_id,p_client_name,p_client_phone,p_client_email,p_notes);
end $$;
revoke all on function public.studio_flow_owner_create_manual_appointment_with_contact_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text)
  from public,anon;
grant execute on function public.studio_flow_owner_create_manual_appointment_with_contact_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text)
  to authenticated;
revoke execute on function public.studio_flow_owner_create_manual_appointment_checked(uuid,uuid,uuid,uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
