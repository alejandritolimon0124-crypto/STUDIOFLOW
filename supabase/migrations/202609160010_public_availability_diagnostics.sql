create or replace function public.studio_flow_public_get_availability_diagnostics(
  p_listing_id uuid,
  p_service_offering_id uuid,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist_id uuid;
  v_schedule schedules%rowtype;
  v_duration integer;
  v_timezone text;
  v_raw integer := 0;
  v_after_lead integer := 0;
  v_within_rules integer := 0;
  v_without_conflicts integer := 0;
  v_complete_candidates integer := 0;
begin
  select coalesce(listing.artist_id, profile.artist_id)
  into v_artist_id
  from marketplace_listings listing
  join marketplace_profiles profile on profile.id = listing.marketplace_profile_id
  where listing.id = p_listing_id
    and listing.visibility_status = 'visible'
    and profile.visibility_status = 'visible';

  select duration_minutes
  into v_duration
  from service_offerings
  where id = p_service_offering_id
    and status = 'active'
    and archived_at is null;

  select schedule.*
  into v_schedule
  from schedules schedule
  where schedule.artist_id = v_artist_id
    and schedule.owner_type::text = 'artist'
    and schedule.status = 'active'
    and schedule.archived_at is null
  order by schedule.created_at desc
  limit 1;

  if v_schedule.id is null or v_duration is null then
    raise exception 'Published schedule or service not found';
  end if;

  v_timezone := coalesce(v_schedule.timezone, 'America/Mexico_City');

  select
    count(*)::integer,
    count(*) filter (
      where slot.starts_at >= now() + make_interval(hours => v_schedule.min_advance_hours)
    )::integer,
    count(*) filter (
      where slot.starts_at >= now() + make_interval(hours => v_schedule.min_advance_hours)
        and exists (
          select 1 from schedule_rules rule
          where rule.schedule_id = v_schedule.id
            and rule.is_active
            and rule.weekday = extract(dow from slot.starts_at at time zone v_timezone)::integer
            and slot.starts_at at time zone v_timezone >= (slot.starts_at at time zone v_timezone)::date + rule.start_time
            and (slot.starts_at + make_interval(mins => v_duration)) at time zone v_timezone <= (slot.starts_at at time zone v_timezone)::date + rule.end_time
            and (rule.break_start_time is null or rule.break_end_time is null
              or (slot.starts_at + make_interval(mins => v_duration)) at time zone v_timezone <= (slot.starts_at at time zone v_timezone)::date + rule.break_start_time
              or slot.starts_at at time zone v_timezone >= (slot.starts_at at time zone v_timezone)::date + rule.break_end_time)
        )
    )::integer,
    count(*) filter (
      where public.studio_flow_slot_obeys_booking_rules(
        slot.id,
        slot.starts_at + make_interval(mins => v_duration)
      )
    )::integer
  into v_raw, v_after_lead, v_within_rules, v_without_conflicts
  from availability_slots slot
  where slot.schedule_id = v_schedule.id
    and slot.status = 'available'
    and (slot.starts_at at time zone v_timezone)::date = p_date
    and slot.starts_at >= now();

  select count(*)::integer
  into v_complete_candidates
  from availability_slots candidate
  where candidate.schedule_id = v_schedule.id
    and candidate.status = 'available'
    and (candidate.starts_at at time zone v_timezone)::date = p_date
    and public.studio_flow_slot_obeys_booking_rules(
      candidate.id,
      candidate.starts_at + make_interval(mins => v_duration)
    )
    and (
      select max(covered.ends_at)
      from availability_slots covered
      where covered.schedule_id = v_schedule.id
        and covered.status = 'available'
        and covered.starts_at >= candidate.starts_at
        and covered.starts_at < candidate.starts_at + make_interval(mins => v_duration)
    ) >= candidate.starts_at + make_interval(mins => v_duration);

  return jsonb_build_object(
    'rawAvailableSlots', v_raw,
    'afterMinimumAdvance', v_after_lead,
    'withinWorkingRules', v_within_rules,
    'withoutAppointmentConflicts', v_without_conflicts,
    'completeCandidates', v_complete_candidates,
    'durationMinutes', v_duration
  );
end;
$$;

revoke all on function public.studio_flow_public_get_availability_diagnostics(uuid, uuid, date) from public;
grant execute on function public.studio_flow_public_get_availability_diagnostics(uuid, uuid, date) to anon, authenticated;
