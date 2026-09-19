begin;

-- Phase one: every provider only accepts points earned in its own context.
update public.artist_marketing_preferences
set point_redemption_scope = 'exclusive', updated_at = now()
where point_redemption_scope <> 'exclusive';

update public.studio_marketing_preferences
set point_redemption_scope = 'exclusive', updated_at = now()
where point_redemption_scope <> 'exclusive';

create or replace function public.studio_flow_client_points_balance_for_reward(
  p_client_id uuid,
  p_artist_id uuid default null,
  p_studio_id uuid default null,
  p_exclusive boolean default true
)
returns integer
language sql
security definer
set search_path = public
as $$
  with account as (
    select id
    from loyalty_accounts
    where client_id = p_client_id
      and status = 'active'
    limit 1
  ),
  active_earns as (
    select fpl.*
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    where fpl.movement_type = 'earn'
      and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
      and (
        (
          p_artist_id is not null
          and p_studio_id is null
          and fpl.metadata ->> 'artistId' = p_artist_id::text
          and nullif(fpl.metadata ->> 'studioId', '') is null
        )
        or (
          p_studio_id is not null
          and fpl.metadata ->> 'studioId' = p_studio_id::text
        )
      )
  ),
  active_earn_window as (
    select min(occurred_at) as first_active_earn_at
    from active_earns
  ),
  eligible_spends as (
    select fpl.*
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    cross join active_earn_window earn_window
    where fpl.movement_type in ('spend', 'expire')
      and earn_window.first_active_earn_at is not null
      and fpl.occurred_at >= earn_window.first_active_earn_at
      and (
        (
          p_artist_id is not null
          and p_studio_id is null
          and (
            fpl.metadata ->> 'rewardArtistId' = p_artist_id::text
            or fpl.metadata ->> 'artistId' = p_artist_id::text
          )
          and nullif(coalesce(fpl.metadata ->> 'rewardStudioId', fpl.metadata ->> 'studioId'), '') is null
        )
        or (
          p_studio_id is not null
          and (
            fpl.metadata ->> 'rewardStudioId' = p_studio_id::text
            or fpl.metadata ->> 'studioId' = p_studio_id::text
          )
        )
      )
  )
  select greatest(
    coalesce((select sum(points) from active_earns), 0)
    + coalesce((select sum(points) from eligible_spends), 0),
    0
  )::integer;
$$;

create or replace function public.studio_flow_artist_set_flow_points_redemption_scope(
  p_scope text,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  insert into artist_marketing_preferences (artist_id, point_redemption_scope, updated_at)
  values (v_artist.id, 'exclusive', now())
  on conflict (artist_id) do update
  set point_redemption_scope = 'exclusive', updated_at = now();

  return public.studio_flow_artist_get_marketing_settings(v_artist.id);
end;
$$;

create or replace function public.studio_flow_studio_set_flow_points_redemption_scope(
  p_scope text,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  insert into studio_marketing_preferences (studio_id, point_redemption_scope, updated_at)
  values (v_studio_id, 'exclusive', now())
  on conflict (studio_id) do update
  set point_redemption_scope = 'exclusive', updated_at = now();

  return public.studio_flow_studio_get_marketing_settings(v_studio_id);
end;
$$;

revoke all on function public.studio_flow_client_points_balance_for_reward(uuid,uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.studio_flow_artist_set_flow_points_redemption_scope(text,uuid) from public, anon;
revoke all on function public.studio_flow_studio_set_flow_points_redemption_scope(text,uuid) from public, anon;
grant execute on function public.studio_flow_artist_set_flow_points_redemption_scope(text,uuid) to authenticated;
grant execute on function public.studio_flow_studio_set_flow_points_redemption_scope(text,uuid) to authenticated;

commit;
