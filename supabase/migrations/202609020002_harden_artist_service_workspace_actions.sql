create or replace function public.studio_flow_artist_assert_owned_service_in_context(
  p_service_offering_id uuid,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns service_offerings
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
  from service_offerings so
  where so.id = p_service_offering_id
    and (
      (
        (v_context ->> 'owner_type') = 'artist'
        and so.owner_type = 'artist'
        and so.artist_id = (v_context ->> 'artist_id')::uuid
        and so.studio_id is null
        and so.membership_id is null
      )
      or (
        (v_context ->> 'owner_type') = 'membership'
        and so.owner_type = 'membership'
        and so.membership_id = (v_context ->> 'membership_id')::uuid
      )
    );

  if v_service.id is null then
    raise exception 'Service offering does not belong to the active workspace';
  end if;

  return v_service;
end;
$$;

create or replace function public.studio_flow_artist_update_context_service_offering(
  p_service_offering_id uuid,
  p_patch jsonb,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current service_offerings%rowtype;
  v_category service_categories%rowtype;
  v_tier service_tiers%rowtype;
  v_service service_offerings%rowtype;
  v_name text;
  v_price numeric;
  v_duration integer;
  v_status service_status;
  v_flow_points_awarded integer;
begin
  v_current := public.studio_flow_artist_assert_owned_service_in_context(
    p_service_offering_id,
    p_context_type,
    p_membership_id
  );

  if v_current.status = 'archived' then
    raise exception 'Archived service offerings cannot be edited';
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_patch ->> 'name', '')), ''), v_current.name);
  v_price := coalesce(nullif(trim(coalesce(p_patch ->> 'price_amount', p_patch ->> 'price', '')), '')::numeric, v_current.price_amount);
  v_duration := coalesce(nullif(regexp_replace(coalesce(p_patch ->> 'duration_minutes', p_patch ->> 'duration', ''), '\D', '', 'g'), '')::integer, v_current.duration_minutes);
  v_flow_points_awarded := case
    when p_patch ? 'flow_points_awarded' or p_patch ? 'flowPointsAwarded'
      then greatest(coalesce(nullif(regexp_replace(coalesce(p_patch ->> 'flow_points_awarded', p_patch ->> 'flowPointsAwarded', '0'), '\D', '', 'g'), '')::integer, 0), 0)
    else v_current.flow_points_awarded
  end;
  v_status := case
    when p_patch ? 'status' and (p_patch ->> 'status') in ('active', 'draft', 'suspended')
      then (p_patch ->> 'status')::service_status
    else v_current.status
  end;

  if p_patch ? 'category' then
    v_category := public.studio_flow_artist_get_or_create_service_category(p_patch ->> 'category');
  else
    select * into v_category from service_categories where id = v_current.category_id;
  end if;

  if p_patch ? 'tier_code' or p_patch ? 'serviceTier' then
    v_tier := public.studio_flow_artist_get_or_create_service_tier(coalesce(p_patch ->> 'tier_code', p_patch ->> 'serviceTier'));
  else
    select * into v_tier from service_tiers where id = v_current.tier_id;
  end if;

  update service_offerings
  set
    category_id = v_category.id,
    tier_id = v_tier.id,
    name = v_name,
    description = case when p_patch ? 'description' then nullif(trim(coalesce(p_patch ->> 'description', '')), '') else description end,
    price_amount = v_price,
    duration_minutes = v_duration,
    flow_points_awarded = v_flow_points_awarded,
    status = v_status,
    archived_at = null,
    updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (actor_profile_id, context, entity_type, entity_id, artist_id, studio_id, membership_id, event_type, before_data, after_data)
  values (auth.uid(), 'marketplace', 'service_offering', v_service.id, v_service.artist_id, v_service.studio_id, v_service.membership_id, 'artist_context_service_updated', to_jsonb(v_current), to_jsonb(v_service));

  return jsonb_build_object('service', public.studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_update_context_service_status(
  p_service_offering_id uuid,
  p_status text,
  p_reason text default null,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current service_offerings%rowtype;
  v_service service_offerings%rowtype;
  v_status service_status;
begin
  v_current := public.studio_flow_artist_assert_owned_service_in_context(
    p_service_offering_id,
    p_context_type,
    p_membership_id
  );
  v_status := case
    when p_status in ('active', 'suspended', 'archived') then p_status::service_status
    else 'active'::service_status
  end;

  update service_offerings
  set
    status = v_status,
    archived_at = case when v_status = 'archived' then coalesce(archived_at, now()) else null end,
    updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (actor_profile_id, context, entity_type, entity_id, artist_id, studio_id, membership_id, event_type, before_data, after_data, metadata)
  values (auth.uid(), 'marketplace', 'service_offering', v_service.id, v_service.artist_id, v_service.studio_id, v_service.membership_id, 'artist_context_service_status_updated', to_jsonb(v_current), to_jsonb(v_service), jsonb_build_object('reason', p_reason));

  return jsonb_build_object('service', public.studio_flow_artist_service_to_json(v_service.id));
end;
$$;

revoke all on function public.studio_flow_artist_assert_owned_service_in_context(uuid, text, uuid) from public;
revoke all on function public.studio_flow_artist_update_context_service_offering(uuid, jsonb, text, uuid) from public;
revoke all on function public.studio_flow_artist_update_context_service_status(uuid, text, text, text, uuid) from public;

grant execute on function public.studio_flow_artist_assert_owned_service_in_context(uuid, text, uuid) to authenticated;
grant execute on function public.studio_flow_artist_update_context_service_offering(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.studio_flow_artist_update_context_service_status(uuid, text, text, text, uuid) to authenticated;
