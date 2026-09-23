create or replace function public.studio_flow_owner_update_membership_service(
  p_studio_id uuid,
  p_membership_id uuid,
  p_service_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_service service_offerings%rowtype;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del servicio es obligatorio.';
  end if;
  if coalesce(p_duration_minutes, 0) <= 0 then
    raise exception 'La duracion debe ser mayor a cero.';
  end if;
  if coalesce(p_price_amount, -1) < 0 then
    raise exception 'El costo no puede ser negativo.';
  end if;

  select so.*
  into v_service
  from service_offerings so
  join artist_studio_memberships membership on membership.id = so.membership_id
  where so.id = p_service_id
    and so.owner_type::text = 'membership'
    and so.membership_id = p_membership_id
    and membership.studio_id = v_studio_id
    and membership.status::text = 'active'
    and membership.archived_at is null
    and so.archived_at is null
  for update;

  if v_service.id is null then
    raise exception 'El servicio no pertenece a una artista activa de este estudio.';
  end if;

  update service_offerings
  set name = trim(p_name),
      duration_minutes = p_duration_minutes,
      price_amount = p_price_amount,
      updated_at = now()
  where id = v_service.id
  returning * into v_service;

  return jsonb_build_object(
    'service', jsonb_build_object(
      'id', v_service.id,
      'name', v_service.name,
      'description', v_service.description,
      'price', v_service.price_amount,
      'priceAmount', v_service.price_amount,
      'durationMinutes', v_service.duration_minutes,
      'status', v_service.status::text,
      'ownerType', v_service.owner_type::text,
      'membershipId', v_service.membership_id
    )
  );
end;
$$;

revoke all on function public.studio_flow_owner_update_membership_service(uuid, uuid, uuid, text, integer, numeric) from public;
grant execute on function public.studio_flow_owner_update_membership_service(uuid, uuid, uuid, text, integer, numeric) to authenticated;

notify pgrst, 'reload schema';
