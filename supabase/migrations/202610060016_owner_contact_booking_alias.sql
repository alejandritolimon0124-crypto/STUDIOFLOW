create function public.studio_flow_owner_book_contact_checked(
  p_studio_id uuid,p_membership_id uuid,p_service_offering_id uuid,
  p_availability_slot_id uuid,p_client_id uuid default null,
  p_client_name text default null,p_client_phone text default null,
  p_client_email text default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
begin
  return public.studio_flow_owner_create_manual_appointment_with_contact_valida(
    p_studio_id,p_membership_id,p_service_offering_id,p_availability_slot_id,
    p_client_id,p_client_name,p_client_phone,p_client_email,p_notes);
end $$;
revoke all on function public.studio_flow_owner_book_contact_checked(uuid,uuid,uuid,uuid,uuid,text,text,text,text)
  from public,anon;
grant execute on function public.studio_flow_owner_book_contact_checked(uuid,uuid,uuid,uuid,uuid,text,text,text,text)
  to authenticated;
revoke execute on function public.studio_flow_owner_create_manual_appointment_with_contact_valida(uuid,uuid,uuid,uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
