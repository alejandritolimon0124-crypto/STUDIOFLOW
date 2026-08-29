create or replace function public.studio_flow_admin_approve_artist(
  p_artist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_before artists%rowtype;
  v_after artists%rowtype;
begin
  v_context := studio_flow_admin_assert_can_manage_artist(p_artist_id);

  select *
  into v_before
  from artists
  where id = p_artist_id
  for update;

  if v_before.id is null then
    raise exception 'Artist not found';
  end if;

  if v_before.status = 'archived' then
    raise exception 'Archived artists cannot be approved';
  end if;

  update artists
  set status = 'active', updated_at = now()
  where id = v_before.id
  returning *
  into v_after;

  if nullif(v_context ->> 'membership_id', '') is not null then
    update artist_studio_memberships
    set status = 'active', updated_at = now()
    where id = (v_context ->> 'membership_id')::uuid
      and status <> 'archived';
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    artist_id,
    membership_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'governance',
    'artist',
    v_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    v_after.id,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'artist_approved',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return studio_flow_admin_artist_payload(v_after.id);
end;
$$;

create or replace function public.studio_flow_admin_reject_artist(
  p_artist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_before artists%rowtype;
  v_after artists%rowtype;
begin
  v_context := studio_flow_admin_assert_can_manage_artist(p_artist_id);

  select *
  into v_before
  from artists
  where id = p_artist_id
  for update;

  if v_before.id is null then
    raise exception 'Artist not found';
  end if;

  if v_before.status = 'archived' then
    raise exception 'Archived artists cannot be rejected';
  end if;

  update artists
  set status = 'rejected', updated_at = now()
  where id = v_before.id
  returning *
  into v_after;

  if nullif(v_context ->> 'membership_id', '') is not null then
    update artist_studio_memberships
    set status = 'inactive', updated_at = now()
    where id = (v_context ->> 'membership_id')::uuid
      and status <> 'archived';
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    artist_id,
    membership_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'governance',
    'artist',
    v_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    v_after.id,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'artist_rejected',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return studio_flow_admin_artist_payload(v_after.id);
end;
$$;

revoke all on function public.studio_flow_admin_approve_artist(uuid) from public;
revoke all on function public.studio_flow_admin_reject_artist(uuid) from public;

grant execute on function public.studio_flow_admin_approve_artist(uuid) to authenticated;
grant execute on function public.studio_flow_admin_reject_artist(uuid) to authenticated;
