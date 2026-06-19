create or replace function public.studio_flow_owner_get_membership_operations(
  p_studio_id uuid,
  p_membership_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_membership artist_studio_memberships%rowtype;
  v_services jsonb := '[]'::jsonb;
  v_schedule schedules%rowtype;
  v_schedule_rules jsonb := '[]'::jsonb;
  v_upcoming_slots jsonb := '[]'::jsonb;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  if p_membership_id is null then
    raise exception 'Membership required';
  end if;

  select *
  into v_membership
  from artist_studio_memberships
  where id = p_membership_id
    and studio_id = v_studio_id
    and status = 'active'
    and archived_at is null;

  if v_membership.id is null then
    raise exception 'Active studio membership required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', service.id,
        'ownerType', service.owner_type,
        'owner_type', service.owner_type,
        'membershipId', service.membership_id,
        'membership_id', service.membership_id,
        'name', service.name,
        'description', service.description,
        'category', coalesce(category.name, 'Servicios'),
        'price', service.price_amount,
        'priceAmount', service.price_amount,
        'price_amount', service.price_amount,
        'durationMinutes', service.duration_minutes,
        'duration_minutes', service.duration_minutes,
        'status', service.status,
        'serviceTier', coalesce(tier.code::text, 'basic'),
        'createdAt', service.created_at,
        'created_at', service.created_at
      )
      order by service.created_at desc
    ),
    '[]'::jsonb
  )
  into v_services
  from service_offerings service
  left join service_categories category on category.id = service.category_id
  left join service_tiers tier on tier.id = service.tier_id
  where service.owner_type = 'membership'
    and service.membership_id = v_membership.id
    and service.status <> 'archived';

  select *
  into v_schedule
  from schedules
  where owner_type = 'membership'
    and membership_id = v_membership.id
    and status <> 'archived'
  order by created_at desc
  limit 1;

  if v_schedule.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rule.id,
          'weekday', rule.weekday,
          'isActive', rule.is_active,
          'is_active', rule.is_active,
          'startTime', rule.start_time,
          'start_time', rule.start_time,
          'endTime', rule.end_time,
          'end_time', rule.end_time,
          'breakStartTime', rule.break_start_time,
          'break_start_time', rule.break_start_time,
          'breakEndTime', rule.break_end_time,
          'break_end_time', rule.break_end_time
        )
        order by rule.weekday
      ),
      '[]'::jsonb
    )
    into v_schedule_rules
    from schedule_rules rule
    where rule.schedule_id = v_schedule.id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', slot.id,
        'availabilitySlotId', slot.id,
        'availability_slot_id', slot.id,
        'scheduleId', slot.schedule_id,
        'schedule_id', slot.schedule_id,
        'artistId', slot.artist_id,
        'artist_id', slot.artist_id,
        'studioId', slot.studio_id,
        'studio_id', slot.studio_id,
        'membershipId', slot.membership_id,
        'membership_id', slot.membership_id,
        'startsAt', slot.starts_at,
        'starts_at', slot.starts_at,
        'endsAt', slot.ends_at,
        'ends_at', slot.ends_at,
        'date', to_char(slot.starts_at at time zone coalesce(v_schedule.timezone, 'America/Mexico_City'), 'YYYY-MM-DD'),
        'time', to_char(slot.starts_at at time zone coalesce(v_schedule.timezone, 'America/Mexico_City'), 'HH24:MI'),
        'end', to_char(slot.ends_at at time zone coalesce(v_schedule.timezone, 'America/Mexico_City'), 'HH24:MI'),
        'status', slot.status
      )
      order by slot.starts_at
    ),
    '[]'::jsonb
  )
  into v_upcoming_slots
  from (
    select *
    from availability_slots
    where membership_id = v_membership.id
      and status = 'available'
      and starts_at >= now()
    order by starts_at
    limit 12
  ) slot;

  return jsonb_build_object(
    'studioId', v_studio_id,
    'studio_id', v_studio_id,
    'membershipId', v_membership.id,
    'membership_id', v_membership.id,
    'artistId', v_membership.artist_id,
    'artist_id', v_membership.artist_id,
    'services', v_services,
    'schedule', case
      when v_schedule.id is null then null
      else jsonb_build_object(
        'id', v_schedule.id,
        'scheduleId', v_schedule.id,
        'schedule_id', v_schedule.id,
        'ownerType', v_schedule.owner_type,
        'owner_type', v_schedule.owner_type,
        'membershipId', v_schedule.membership_id,
        'membership_id', v_schedule.membership_id,
        'timezone', v_schedule.timezone,
        'intervalMinutes', v_schedule.slot_interval_minutes,
        'interval_minutes', v_schedule.slot_interval_minutes,
        'status', v_schedule.status,
        'rules', v_schedule_rules
      )
    end,
    'upcomingSlots', v_upcoming_slots,
    'upcoming_slots', v_upcoming_slots
  );
end;
$$;

revoke all on function public.studio_flow_owner_get_membership_operations(uuid, uuid) from public;
grant execute on function public.studio_flow_owner_get_membership_operations(uuid, uuid) to authenticated;
