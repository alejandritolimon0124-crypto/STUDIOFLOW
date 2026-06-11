create or replace function public.studio_flow_artist_create_service_offering(
  p_service jsonb,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_category service_categories%rowtype;
  v_tier service_tiers%rowtype;
  v_service service_offerings%rowtype;
  v_name text;
  v_price numeric;
  v_duration integer;
  v_status service_status;
begin
  v_artist := studio_flow_artist_current_owned_artist(p_artist_id);
  v_name := nullif(trim(coalesce(p_service ->> 'name', '')), '');

  if v_name is null then
    raise exception 'Service name is required';
  end if;

  v_price := coalesce(nullif(trim(coalesce(p_service ->> 'price_amount', p_service ->> 'price', '')), '')::numeric, 0);
  v_duration := coalesce(nullif(regexp_replace(coalesce(p_service ->> 'duration_minutes', p_service ->> 'duration', '60'), '\D', '', 'g'), '')::integer, 60);
  v_status := case
    when coalesce(p_service ->> 'status', 'active') in ('active', 'draft', 'suspended')
      then (p_service ->> 'status')::service_status
    else 'active'::service_status
  end;

  if v_price < 0 then
    raise exception 'Service price must be greater than or equal to zero';
  end if;

  if v_duration <= 0 then
    raise exception 'Service duration must be greater than zero';
  end if;

  v_category := studio_flow_artist_get_or_create_service_category(p_service ->> 'category');
  v_tier := studio_flow_artist_get_or_create_service_tier(coalesce(p_service ->> 'tier_code', p_service ->> 'serviceTier'));

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
    status,
    archived_at,
    updated_at
  )
  values (
    'artist',
    v_artist.id,
    null,
    null,
    v_category.id,
    v_tier.id,
    v_name,
    nullif(trim(coalesce(p_service ->> 'description', '')), ''),
    v_price,
    v_duration,
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
    event_type,
    after_data
  )
  values (
    auth.uid(),
    'marketplace',
    'service_offering',
    v_service.id,
    v_artist.id,
    'artist_service_created',
    to_jsonb(v_service)
  );

  return jsonb_build_object('service', studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_update_service_offering(
  p_service_offering_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_category service_categories%rowtype;
  v_tier service_tiers%rowtype;
  v_current service_offerings%rowtype;
  v_service service_offerings%rowtype;
  v_name text;
  v_price numeric;
  v_duration integer;
  v_status service_status;
begin
  v_artist := studio_flow_artist_current_owned_artist(null);

  select *
  into v_current
  from service_offerings
  where id = p_service_offering_id
    and owner_type = 'artist'
    and artist_id = v_artist.id
  for update;

  if v_current.id is null then
    raise exception 'Service offering not found for current artist';
  end if;

  if v_current.status = 'archived' then
    raise exception 'Archived service offerings cannot be edited';
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_patch ->> 'name', '')), ''), v_current.name);
  v_price := coalesce(nullif(trim(coalesce(p_patch ->> 'price_amount', p_patch ->> 'price', '')), '')::numeric, v_current.price_amount);
  v_duration := coalesce(nullif(regexp_replace(coalesce(p_patch ->> 'duration_minutes', p_patch ->> 'duration', ''), '\D', '', 'g'), '')::integer, v_current.duration_minutes);
  v_status := case
    when p_patch ? 'status' and (p_patch ->> 'status') in ('active', 'draft', 'suspended')
      then (p_patch ->> 'status')::service_status
    else v_current.status
  end;

  if v_price < 0 then
    raise exception 'Service price must be greater than or equal to zero';
  end if;

  if v_duration <= 0 then
    raise exception 'Service duration must be greater than zero';
  end if;

  if p_patch ? 'category' then
    v_category := studio_flow_artist_get_or_create_service_category(p_patch ->> 'category');
  else
    select * into v_category from service_categories where id = v_current.category_id;
  end if;

  if p_patch ? 'tier_code' or p_patch ? 'serviceTier' then
    v_tier := studio_flow_artist_get_or_create_service_tier(coalesce(p_patch ->> 'tier_code', p_patch ->> 'serviceTier'));
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
    status = v_status,
    archived_at = null,
    updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    artist_id,
    event_type,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'marketplace',
    'service_offering',
    v_service.id,
    v_artist.id,
    'artist_service_updated',
    to_jsonb(v_current),
    to_jsonb(v_service)
  );

  return jsonb_build_object('service', studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_activate_service_offering(
  p_service_offering_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_current service_offerings%rowtype;
  v_service service_offerings%rowtype;
begin
  v_artist := studio_flow_artist_current_owned_artist(null);

  select *
  into v_current
  from service_offerings
  where id = p_service_offering_id
    and owner_type = 'artist'
    and artist_id = v_artist.id
  for update;

  if v_current.id is null then
    raise exception 'Service offering not found for current artist';
  end if;

  if v_current.status = 'archived' then
    raise exception 'Archived service offerings cannot be activated';
  end if;

  update service_offerings
  set status = 'active', archived_at = null, updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (actor_profile_id, context, entity_type, entity_id, artist_id, event_type, before_data, after_data)
  values (auth.uid(), 'marketplace', 'service_offering', v_service.id, v_artist.id, 'artist_service_activated', to_jsonb(v_current), to_jsonb(v_service));

  return jsonb_build_object('service', studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_suspend_service_offering(
  p_service_offering_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_current service_offerings%rowtype;
  v_service service_offerings%rowtype;
begin
  v_artist := studio_flow_artist_current_owned_artist(null);

  select *
  into v_current
  from service_offerings
  where id = p_service_offering_id
    and owner_type = 'artist'
    and artist_id = v_artist.id
  for update;

  if v_current.id is null then
    raise exception 'Service offering not found for current artist';
  end if;

  if v_current.status = 'archived' then
    raise exception 'Archived service offerings cannot be suspended';
  end if;

  update service_offerings
  set status = 'suspended', archived_at = null, updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (actor_profile_id, context, entity_type, entity_id, artist_id, event_type, before_data, after_data, metadata)
  values (auth.uid(), 'marketplace', 'service_offering', v_service.id, v_artist.id, 'artist_service_suspended', to_jsonb(v_current), to_jsonb(v_service), jsonb_build_object('reason', p_reason));

  return jsonb_build_object('service', studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_archive_service_offering(
  p_service_offering_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_current service_offerings%rowtype;
  v_service service_offerings%rowtype;
begin
  v_artist := studio_flow_artist_current_owned_artist(null);

  select *
  into v_current
  from service_offerings
  where id = p_service_offering_id
    and owner_type = 'artist'
    and artist_id = v_artist.id
  for update;

  if v_current.id is null then
    raise exception 'Service offering not found for current artist';
  end if;

  update service_offerings
  set status = 'archived', archived_at = coalesce(archived_at, now()), updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (actor_profile_id, context, entity_type, entity_id, artist_id, event_type, before_data, after_data, metadata)
  values (auth.uid(), 'marketplace', 'service_offering', v_service.id, v_artist.id, 'artist_service_archived', to_jsonb(v_current), to_jsonb(v_service), jsonb_build_object('reason', p_reason));

  return jsonb_build_object('service', studio_flow_artist_service_to_json(v_service.id));
end;
$$;
