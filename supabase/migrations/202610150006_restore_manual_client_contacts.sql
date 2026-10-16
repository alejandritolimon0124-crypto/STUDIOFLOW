create or replace function public.studio_flow_list_archived_manual_contacts(
  p_studio_id uuid default null,
  p_query text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist_id uuid;
  v_query text := lower(trim(coalesce(p_query, '')));
  v_contacts jsonb;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesion para consultar contactos.';
  end if;
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    v_artist_id := (public.studio_flow_artist_assert_work_context('artist', null) ->> 'artist_id')::uuid;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.display_name,
    'phone', c.phone,
    'email', c.email,
    'archivedAt', c.archived_at
  ) order by c.archived_at desc), '[]'::jsonb)
  into v_contacts
  from (
    select client.* from public.clients client
    where client.status = 'archived' and client.archived_at is not null
      and client.profile_id is null
      and exists (
        select 1 from public.appointments a where a.client_id = client.id
          and ((p_studio_id is not null and a.studio_id = p_studio_id)
            or (p_studio_id is null and a.artist_id = v_artist_id and a.studio_id is null))
      )
      and (v_query = '' or lower(coalesce(client.display_name, '')) like '%' || v_query || '%'
        or lower(coalesce(client.phone, '')) like '%' || v_query || '%'
        or lower(coalesce(client.email, '')) like '%' || v_query || '%')
    order by client.archived_at desc
    limit 30
  ) c;
  return v_contacts;
end;
$$;

create or replace function public.studio_flow_restore_manual_client_contact(
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
    raise exception 'Inicia sesion para restaurar contactos.';
  end if;
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    v_artist_id := (public.studio_flow_artist_assert_work_context('artist', null) ->> 'artist_id')::uuid;
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if v_client.id is null or v_client.status <> 'archived' or v_client.archived_at is null
    or v_client.profile_id is not null then
    raise exception 'Este contacto manual archivado ya no esta disponible.';
  end if;
  if not exists (
    select 1 from public.appointments a where a.client_id = p_client_id
      and ((p_studio_id is not null and a.studio_id = p_studio_id)
        or (p_studio_id is null and a.artist_id = v_artist_id and a.studio_id is null))
  ) or exists (
    select 1 from public.appointments a where a.client_id = p_client_id
      and ((p_studio_id is not null and a.studio_id is distinct from p_studio_id)
        or (p_studio_id is null and (a.artist_id is distinct from v_artist_id or a.studio_id is not null)))
  ) then
    raise exception 'Este contacto no pertenece exclusivamente a tu negocio.';
  end if;
  if exists (
    select 1 from public.clients active_client
    where active_client.id <> p_client_id and active_client.status = 'active'
      and active_client.archived_at is null
      and ((length(public.studio_flow_phone_key(v_client.phone)) = 10
        and public.studio_flow_phone_key(active_client.phone) = public.studio_flow_phone_key(v_client.phone))
        or (nullif(trim(coalesce(v_client.email, '')), '') is not null
          and lower(trim(active_client.email)) = lower(trim(v_client.email))))
  ) then
    raise exception 'Ya existe una clienta activa con ese telefono o correo. Revisa los datos antes de restaurar.';
  end if;

  update public.clients
  set status = 'active', archived_at = null, updated_at = now()
  where id = p_client_id;
  return true;
end;
$$;

revoke all on function public.studio_flow_list_archived_manual_contacts(uuid, text) from public, anon;
grant execute on function public.studio_flow_list_archived_manual_contacts(uuid, text) to authenticated;
revoke all on function public.studio_flow_restore_manual_client_contact(uuid, uuid) from public, anon;
grant execute on function public.studio_flow_restore_manual_client_contact(uuid, uuid) to authenticated;
