alter table public.service_offerings
add column if not exists flow_points_awarded integer not null default 0;

alter table public.service_offerings
drop constraint if exists service_offerings_flow_points_awarded_check;

alter table public.service_offerings
add constraint service_offerings_flow_points_awarded_check
check (flow_points_awarded >= 0);

create or replace function public.studio_flow_artist_service_to_json(
  p_service_offering_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', so.id,
    'owner_type', so.owner_type,
    'ownerType', so.owner_type,
    'artist_id', so.artist_id,
    'artistId', so.artist_id,
    'studio_id', so.studio_id,
    'studioId', so.studio_id,
    'membership_id', so.membership_id,
    'membershipId', so.membership_id,
    'category_id', so.category_id,
    'categoryId', so.category_id,
    'tier_id', so.tier_id,
    'tierId', so.tier_id,
    'category', coalesce(sc.name, 'Servicios'),
    'name', so.name,
    'description', so.description,
    'price_amount', so.price_amount,
    'priceAmount', so.price_amount,
    'price', so.price_amount,
    'duration_minutes', so.duration_minutes,
    'durationMinutes', so.duration_minutes,
    'duration', concat(so.duration_minutes, ' min'),
    'flow_points_awarded', so.flow_points_awarded,
    'flowPointsAwarded', so.flow_points_awarded,
    'bookings', 0,
    'demand', 'Nueva',
    'status', so.status,
    'serviceTier', coalesce(st.code::text, 'basic'),
    'service_tier', coalesce(st.code::text, 'basic'),
    'created_at', so.created_at,
    'createdAt', so.created_at,
    'updated_at', so.updated_at,
    'updatedAt', so.updated_at,
    'archived_at', so.archived_at,
    'archivedAt', so.archived_at
  )
  from service_offerings so
  left join service_categories sc on sc.id = so.category_id
  left join service_tiers st on st.id = so.tier_id
  where so.id = p_service_offering_id;
$$;

create or replace function public.studio_flow_artist_create_context_service_offering(
  p_service jsonb,
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
  v_category service_categories%rowtype;
  v_tier service_tiers%rowtype;
  v_service service_offerings%rowtype;
  v_name text;
  v_price numeric;
  v_duration integer;
  v_status service_status;
  v_flow_points_awarded integer;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);
  v_name := nullif(trim(coalesce(p_service ->> 'name', '')), '');

  if v_name is null then
    raise exception 'Service name is required';
  end if;

  v_price := coalesce(nullif(trim(coalesce(p_service ->> 'price_amount', p_service ->> 'price', '')), '')::numeric, 0);
  v_duration := coalesce(nullif(regexp_replace(coalesce(p_service ->> 'duration_minutes', p_service ->> 'duration', '60'), '\D', '', 'g'), '')::integer, 60);
  v_flow_points_awarded := greatest(coalesce(nullif(regexp_replace(coalesce(p_service ->> 'flow_points_awarded', p_service ->> 'flowPointsAwarded', '0'), '\D', '', 'g'), '')::integer, 0), 0);
  v_status := case
    when coalesce(p_service ->> 'status', 'active') in ('active', 'draft', 'suspended')
      then (p_service ->> 'status')::service_status
    else 'active'::service_status
  end;

  v_category := public.studio_flow_artist_get_or_create_service_category(p_service ->> 'category');
  v_tier := public.studio_flow_artist_get_or_create_service_tier(coalesce(p_service ->> 'tier_code', p_service ->> 'serviceTier'));

  insert into service_offerings (
    owner_type,
    artist_id,
    studio_id,
    membership_id,
    category_id,
    tier_id,
    name,
    description,
    price_amount,
    duration_minutes,
    flow_points_awarded,
    status,
    archived_at,
    updated_at
  )
  values (
    (v_context ->> 'owner_type')::service_owner_type,
    case when (v_context ->> 'owner_type') = 'artist' then nullif(v_context ->> 'artist_id', '')::uuid else null end,
    case when (v_context ->> 'owner_type') = 'studio' then nullif(v_context ->> 'studio_id', '')::uuid else null end,
    case when (v_context ->> 'owner_type') = 'membership' then nullif(v_context ->> 'membership_id', '')::uuid else null end,
    v_category.id,
    v_tier.id,
    v_name,
    nullif(trim(coalesce(p_service ->> 'description', '')), ''),
    v_price,
    v_duration,
    v_flow_points_awarded,
    v_status,
    null,
    now()
  )
  returning *
  into v_service;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    artist_id,
    studio_id,
    membership_id,
    event_type,
    after_data
  )
  values (
    auth.uid(),
    'marketplace',
    'service_offering',
    v_service.id,
    nullif(v_context ->> 'artist_id', '')::uuid,
    nullif(v_context ->> 'studio_id', '')::uuid,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'artist_context_service_created',
    to_jsonb(v_service)
  );

  return jsonb_build_object('service', public.studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_update_context_service_offering(
  p_service_offering_id uuid,
  p_patch jsonb
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
  v_current := public.studio_flow_artist_assert_context_service(p_service_offering_id);

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

revoke all on function public.studio_flow_artist_service_to_json(uuid) from public;
revoke all on function public.studio_flow_artist_create_context_service_offering(jsonb, text, uuid) from public;
revoke all on function public.studio_flow_artist_update_context_service_offering(uuid, jsonb) from public;

grant execute on function public.studio_flow_artist_service_to_json(uuid) to authenticated;
grant execute on function public.studio_flow_artist_create_context_service_offering(jsonb, text, uuid) to authenticated;
grant execute on function public.studio_flow_artist_update_context_service_offering(uuid, jsonb) to authenticated;
