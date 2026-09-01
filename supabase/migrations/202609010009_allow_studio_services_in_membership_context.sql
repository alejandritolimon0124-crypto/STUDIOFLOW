create or replace function public.studio_flow_artist_assert_service_in_context(
  p_service_offering_id uuid,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_service service_offerings%rowtype;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_service
  from service_offerings
  where id = p_service_offering_id
    and status = 'active'
    and archived_at is null;

  if v_service.id is null then
    raise exception 'Active service offering required';
  end if;

  if not (
    ((v_context ->> 'owner_type') = 'artist' and v_service.owner_type = 'artist' and v_service.artist_id = (v_context ->> 'artist_id')::uuid)
    or ((v_context ->> 'owner_type') = 'membership' and v_service.owner_type = 'membership' and v_service.membership_id = (v_context ->> 'membership_id')::uuid)
    or ((v_context ->> 'owner_type') = 'membership' and v_service.owner_type = 'studio' and v_service.studio_id = (v_context ->> 'studio_id')::uuid)
  ) then
    raise exception 'Service does not belong to the active workspace';
  end if;

  return v_context;
end;
$$;

revoke all on function public.studio_flow_artist_assert_service_in_context(uuid, text, uuid) from public;
grant execute on function public.studio_flow_artist_assert_service_in_context(uuid, text, uuid) to authenticated;
