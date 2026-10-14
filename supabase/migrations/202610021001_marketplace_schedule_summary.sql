create or replace function public.studio_flow_marketplace_get_schedule_summaries()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with visible_listings as (
    select
      ml.id as listing_id,
      mp.profile_type,
      coalesce(ml.artist_id, mp.artist_id, membership.artist_id) as artist_id,
      coalesce(ml.studio_id, mp.studio_id, membership.studio_id) as studio_id,
      coalesce(ml.membership_id, mp.membership_id) as membership_id
    from marketplace_listings ml
    join marketplace_profiles mp on mp.id = ml.marketplace_profile_id
    left join artist_studio_memberships membership
      on membership.id = coalesce(ml.membership_id, mp.membership_id)
    where ml.visibility_status = 'visible'
      and mp.visibility_status = 'visible'
      and (ml.expires_at is null or ml.expires_at > now())
  ),
  listing_rules as (
    select
      listing.listing_id,
      rule.weekday,
      min(rule.start_time) as start_time,
      max(rule.end_time) as end_time
    from visible_listings listing
    join schedules schedule
      on schedule.status = 'active'
      and schedule.archived_at is null
      and (
        (listing.profile_type <> 'studio' and listing.membership_id is not null
          and schedule.owner_type = 'membership' and schedule.membership_id = listing.membership_id)
        or (listing.profile_type <> 'studio' and listing.membership_id is null
          and schedule.owner_type = 'artist' and schedule.artist_id = listing.artist_id)
        or (listing.profile_type = 'studio' and schedule.owner_type = 'membership'
          and exists (
            select 1
            from artist_studio_memberships active_membership
            where active_membership.id = schedule.membership_id
              and active_membership.studio_id = listing.studio_id
              and active_membership.status = 'active'
              and active_membership.archived_at is null
          ))
      )
    join schedule_rules rule on rule.schedule_id = schedule.id and rule.is_active
    group by listing.listing_id, rule.weekday
  ),
  summaries as (
    select
      listing.listing_id,
      coalesce(jsonb_agg(jsonb_build_object(
        'weekday', rules.weekday,
        'startTime', to_char(rules.start_time, 'HH24:MI'),
        'endTime', to_char(rules.end_time, 'HH24:MI')
      ) order by rules.weekday) filter (where rules.weekday is not null), '[]'::jsonb) as schedule
    from visible_listings listing
    left join listing_rules rules on rules.listing_id = listing.listing_id
    group by listing.listing_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'listingId', listing_id,
    'schedule', schedule
  )), '[]'::jsonb)
  from summaries;
$$;

revoke all on function public.studio_flow_marketplace_get_schedule_summaries() from public;
grant execute on function public.studio_flow_marketplace_get_schedule_summaries() to anon, authenticated;
