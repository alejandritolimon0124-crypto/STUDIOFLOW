create or replace function public.studio_flow_artist_get_own_profile_core(p_artist_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_set(
    public.studio_flow_artist_get_own_profile(p_artist_id),
    '{artist_profile,portfolio_paths}',
    '[]'::jsonb
  );
$$;

create or replace function public.studio_flow_artist_get_own_portfolio(p_artist_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    public.studio_flow_artist_get_own_profile(p_artist_id)->'artist_profile'->'portfolio_paths',
    '[]'::jsonb
  );
$$;

revoke execute on function public.studio_flow_artist_get_own_profile_core(uuid) from public, anon;
revoke execute on function public.studio_flow_artist_get_own_portfolio(uuid) from public, anon;
grant execute on function public.studio_flow_artist_get_own_profile_core(uuid) to authenticated;
grant execute on function public.studio_flow_artist_get_own_portfolio(uuid) to authenticated;
