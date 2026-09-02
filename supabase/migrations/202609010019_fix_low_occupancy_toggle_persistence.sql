create or replace function public.studio_flow_artist_set_low_occupancy_automation(
  p_active boolean,
  p_period text default 'week',
  p_threshold integer default 40,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_active boolean := coalesce(p_active, false);
  v_threshold integer := least(greatest(coalesce(p_threshold, 40), 1), 40);
  v_period text := case when p_period in ('week', 'month') then p_period else 'week' end;
  v_settings jsonb;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  insert into artist_marketing_preferences (
    artist_id,
    low_occupancy_enabled,
    low_occupancy_period,
    low_occupancy_threshold,
    updated_at
  )
  values (
    v_artist.id,
    v_active,
    v_period,
    v_threshold,
    now()
  )
  on conflict (artist_id) do update
  set low_occupancy_enabled = excluded.low_occupancy_enabled,
      low_occupancy_period = excluded.low_occupancy_period,
      low_occupancy_threshold = excluded.low_occupancy_threshold,
      updated_at = now();

  update promotions
  set status = case when v_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when v_active then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = jsonb_build_object(
        'period', v_period,
        'threshold', v_threshold,
        'source', 'low_occupancy_automation'
      ),
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'low_occupancy';

  if not found then
    insert into promotions (
      scope_type,
      artist_id,
      created_by_profile_id,
      promotion_type,
      name,
      status,
      starts_at,
      rules,
      updated_at
    )
    values (
      'artist',
      v_artist.id,
      auth.uid(),
      'low_occupancy',
      'Baja ocupacion',
      case when v_active then 'active' else 'paused' end,
      case when v_active then now() else null end,
      jsonb_build_object(
        'period', v_period,
        'threshold', v_threshold,
        'source', 'low_occupancy_automation'
      ),
      now()
    );
  end if;

  v_settings := public.studio_flow_artist_get_marketing_settings(v_artist.id);

  return jsonb_set(
    jsonb_set(
      v_settings,
      '{lowOccupancy}',
      jsonb_build_object('active', v_active, 'period', v_period, 'threshold', v_threshold),
      true
    ),
    '{low_occupancy}',
    jsonb_build_object('active', v_active, 'period', v_period, 'threshold', v_threshold),
    true
  );
end;
$$;

revoke all on function public.studio_flow_artist_set_low_occupancy_automation(boolean, text, integer, uuid) from public;
grant execute on function public.studio_flow_artist_set_low_occupancy_automation(boolean, text, integer, uuid) to authenticated;
