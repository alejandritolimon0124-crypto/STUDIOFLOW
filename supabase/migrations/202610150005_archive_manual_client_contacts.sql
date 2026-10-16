create or replace function public.studio_flow_archive_manual_client_contact(
  p_client_id uuid,
  p_studio_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_client public.clients%rowtype;
  v_artist_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesion para archivar contactos.';
  end if;

  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    v_artist_id := (public.studio_flow_artist_assert_work_context('artist', null) ->> 'artist_id')::uuid;
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if v_client.id is null or v_client.status = 'archived' or v_client.archived_at is not null then
    raise exception 'Este contacto ya no esta disponible.';
  end if;
  if v_client.profile_id is not null then
    raise exception 'No se puede archivar una cuenta registrada de clienta.';
  end if;
  if not exists (
    select 1 from public.appointments a where a.client_id = p_client_id
      and (p_studio_id is not null and a.studio_id = p_studio_id
        or p_studio_id is null and a.artist_id = v_artist_id and a.studio_id is null)
  ) then
    raise exception 'Este contacto no pertenece a tu agenda.';
  end if;
  if exists (
    select 1 from public.appointments a where a.client_id = p_client_id
      and (a.status not in ('completed', 'cancelled', 'no_show')
        or p_studio_id is not null and a.studio_id is distinct from p_studio_id
        or p_studio_id is null and (a.artist_id is distinct from v_artist_id or a.studio_id is not null))
  ) then
    raise exception 'No se puede archivar: hay citas pendientes o actividad en otro negocio.';
  end if;
  if exists (
    select 1 from public.flow_point_ledger l
    join public.loyalty_accounts account on account.id = l.loyalty_account_id
    where account.client_id = p_client_id
  ) then
    raise exception 'Este contacto tiene movimientos de puntos y requiere revision de soporte.';
  end if;
  if exists (
    select 1 from public.studio_flow_pending_manual_bookings pending
    where pending.status = 'pending'
      and (pending.guest_client_id = p_client_id or pending.target_client_id = p_client_id)
  ) then
    raise exception 'Este contacto tiene una confirmacion de cita pendiente.';
  end if;

  update public.clients
  set status = 'archived', archived_at = now(), updated_at = now()
  where id = p_client_id;
  return true;
end;
$$;

revoke all on function public.studio_flow_archive_manual_client_contact(uuid, uuid) from public, anon;
grant execute on function public.studio_flow_archive_manual_client_contact(uuid, uuid) to authenticated;
