create or replace function public.studio_flow_public_get_slot_generation_diagnostics(
  p_listing_id uuid,
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
  v_timezone text;
  v_status_counts jsonb;
begin
  select coalesce(listing.artist_id, profile.artist_id)
  into v_artist_id
  from marketplace_listings listing
  join marketplace_profiles profile on profile.id = listing.marketplace_profile_id
  where listing.id = p_listing_id
    and listing.visibility_status = 'visible'
    and profile.visibility_status = 'visible';

  select schedule.*
  into v_schedule
  from schedules schedule
  where schedule.artist_id = v_artist_id
    and schedule.owner_type::text = 'artist'
    and schedule.status = 'active'
    and schedule.archived_at is null
  order by schedule.created_at desc
  limit 1;

  if v_schedule.id is null then
    raise exception 'Published schedule not found';
  end if;

  v_timezone := coalesce(v_schedule.timezone, 'America/Mexico_City');

  select coalesce(jsonb_object_agg(grouped.status, grouped.total), '{}'::jsonb)
  into v_status_counts
  from (
    select slot.status::text as status, count(*)::integer as total
    from availability_slots slot
    where slot.schedule_id = v_schedule.id
      and (slot.starts_at at time zone v_timezone)::date = p_date
    group by slot.status
  ) grouped;

  return jsonb_build_object(
    'date', p_date,
    'statusCounts', v_status_counts,
    'firstSlot', (
      select min(slot.starts_at at time zone v_timezone)
      from availability_slots slot
      where slot.schedule_id = v_schedule.id
        and (slot.starts_at at time zone v_timezone)::date = p_date
    ),
    'lastSlot', (
      select max(slot.ends_at at time zone v_timezone)
      from availability_slots slot
      where slot.schedule_id = v_schedule.id
        and (slot.starts_at at time zone v_timezone)::date = p_date
    )
  );
end;
$$;

revoke all on function public.studio_flow_public_get_slot_generation_diagnostics(uuid, date) from public;
grant execute on function public.studio_flow_public_get_slot_generation_diagnostics(uuid, date) to anon, authenticated;
