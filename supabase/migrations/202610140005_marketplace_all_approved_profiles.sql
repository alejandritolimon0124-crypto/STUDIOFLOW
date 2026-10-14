do $migration$
declare
  function_name text;
  definition text;
begin
  foreach function_name in array array[
    'studio_flow_marketplace_get_listings',
    'studio_flow_marketplace_get_compact_listings'
  ] loop
    select pg_get_functiondef(('public.' || function_name || '()')::regprocedure)
    into definition;
    if position('and services.service_count > 0' in definition) = 0 then
      raise exception 'Marketplace query changed: %', function_name;
    end if;
    execute replace(definition, 'and services.service_count > 0', 'and true');
  end loop;
end;
$migration$;

create or replace function public.studio_flow_marketplace_get_compact_listings_with_spaces()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with source as (
    select public.studio_flow_marketplace_get_compact_listings() as payload
  )
  select jsonb_set(payload, '{listings}', coalesce((
    select jsonb_agg(
      listing || jsonb_build_object(
        'beautySpaces',
        coalesce(
          case when listing->>'profileType' = 'studio'
            then to_jsonb(sp.beauty_spaces)
            else to_jsonb(ap.beauty_spaces)
          end,
          '["beauty_and_personal_care"]'::jsonb
        )
      ) order by item.ordinality
    )
    from jsonb_array_elements(coalesce(payload->'listings', '[]'::jsonb))
      with ordinality as item(listing, ordinality)
    left join public.artist_profiles ap
      on ap.artist_id = nullif(listing->>'artistId', '')::uuid
    left join public.studio_profiles sp
      on sp.studio_id = nullif(listing->>'studioId', '')::uuid
  ), '[]'::jsonb))
  from source;
$$;

revoke all on function public.studio_flow_marketplace_get_compact_listings_with_spaces() from public, anon;
grant execute on function public.studio_flow_marketplace_get_compact_listings_with_spaces() to authenticated;
