create or replace function public.studio_flow_public_get_booking_rule_summary(
  p_listing_id uuid,
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_schedule schedules%rowtype;
  v_rule schedule_rules%rowtype;
  v_artist_id uuid;
  v_membership_id uuid;
  v_timezone text := 'America/Mexico_City';
  v_date date := coalesce(p_date, current_date);
  v_is_blocked boolean := false;
begin
  select
    coalesce(listing.artist_id, profile.artist_id, membership.artist_id),
    coalesce(listing.membership_id, profile.membership_id, membership.id)
  into v_artist_id, v_membership_id
  from marketplace_listings listing
  join marketplace_profiles profile on profile.id = listing.marketplace_profile_id
  left join artist_studio_memberships membership
    on membership.id = coalesce(listing.membership_id, profile.membership_id)
  where listing.id = p_listing_id
    and listing.visibility_status = 'visible'
    and profile.visibility_status = 'visible'
    and (listing.expires_at is null or listing.expires_at > now());

  if v_artist_id is null then
    raise exception 'Visible listing not found';
  end if;

  select schedule.*
  into v_schedule
  from schedules schedule
  where schedule.artist_id = v_artist_id
    and schedule.owner_type::text = case when v_membership_id is null then 'artist' else 'membership' end
    and schedule.membership_id is not distinct from v_membership_id
    and schedule.status = 'active'
    and schedule.archived_at is null
  order by schedule.created_at desc
  limit 1;

  if v_schedule.id is null then
    return jsonb_build_object(
      'hasSchedule', false,
      'has_schedule', false,
      'date', v_date
    );
  end if;

  v_timezone := coalesce(v_schedule.timezone, v_timezone);

  select rule.*
  into v_rule
  from schedule_rules rule
  where rule.schedule_id = v_schedule.id
    and rule.weekday = extract(dow from v_date)::integer
  limit 1;

  select exists (
    select 1
    from calendar_blocks block
    where block.schedule_id = v_schedule.id
      and block.status = 'active'
      and block.starts_at < ((v_date + 1)::timestamp at time zone v_timezone)
      and block.ends_at > (v_date::timestamp at time zone v_timezone)
  ) into v_is_blocked;

  return jsonb_build_object(
    'hasSchedule', true,
    'has_schedule', true,
    'date', v_date,
    'timezone', v_timezone,
    'minAdvanceHours', v_schedule.min_advance_hours,
    'min_advance_hours', v_schedule.min_advance_hours,
    'intervalMinutes', v_schedule.slot_interval_minutes,
    'interval_minutes', v_schedule.slot_interval_minutes,
    'dayActive', coalesce(v_rule.is_active, false),
    'day_active', coalesce(v_rule.is_active, false),
    'startTime', v_rule.start_time,
    'start_time', v_rule.start_time,
    'endTime', v_rule.end_time,
    'end_time', v_rule.end_time,
    'breakStartTime', v_rule.break_start_time,
    'break_start_time', v_rule.break_start_time,
    'breakEndTime', v_rule.break_end_time,
    'break_end_time', v_rule.break_end_time,
    'blocked', v_is_blocked
  );
end;
$$;

revoke all on function public.studio_flow_public_get_booking_rule_summary(uuid, date) from public;
grant execute on function public.studio_flow_public_get_booking_rule_summary(uuid, date) to anon, authenticated;
