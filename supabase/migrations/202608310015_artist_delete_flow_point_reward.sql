create or replace function public.studio_flow_artist_delete_flow_point_reward(
  p_reward_id uuid,
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
  if p_reward_id is null then
    raise exception 'Reward id required';
  end if;

  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  update rewards
  set status = 'retired'::reward_status,
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  where id = p_reward_id
    and scope_type = 'artist'
    and artist_id = v_artist.id
    and archived_at is null;

  if not found then
    raise exception 'Flow Points benefit not found';
  end if;

  return public.studio_flow_artist_get_marketing_settings(v_artist.id);
end;
$$;

revoke all on function public.studio_flow_artist_delete_flow_point_reward(uuid, uuid) from public;
grant execute on function public.studio_flow_artist_delete_flow_point_reward(uuid, uuid) to authenticated;
