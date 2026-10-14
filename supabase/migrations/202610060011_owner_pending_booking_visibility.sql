create function public.studio_flow_owner_pending_manual_bookings(p_studio_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_result jsonb;
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'appointmentId',r.appointment_id,'expiresAt',r.expires_at)),'[]'::jsonb)
    into v_result
  from public.studio_flow_pending_manual_bookings r
  join public.appointments a on a.id=r.appointment_id
  where r.studio_id=p_studio_id and r.status='pending'
    and r.expires_at>now() and a.status='scheduled';
  return v_result;
end $$;
revoke all on function public.studio_flow_owner_pending_manual_bookings(uuid) from public,anon;
grant execute on function public.studio_flow_owner_pending_manual_bookings(uuid) to authenticated;
