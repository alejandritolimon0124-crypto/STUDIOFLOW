do $migration$
declare
  definition text;
  portfolio_expression text := 'case when profile_type = ''studio'' then coalesce(studio_gallery_paths, array[]::text[]) else coalesce(portfolio_paths, array[]::text[]) end';
  photo_expression text := 'case when profile_type = ''studio'' then logo_path else photo_path end';
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure)
    into definition;

  if position('FUNCTION public.studio_flow_marketplace_get_listings()' in definition) = 0
    or position('''portfolioPaths'', ' || portfolio_expression in definition) = 0
    or position('''portfolio_paths'', ' || portfolio_expression in definition) = 0 then
    raise exception 'Marketplace source changed; compact function was not updated';
  end if;

  definition := replace(definition,
    'FUNCTION public.studio_flow_marketplace_get_listings()',
    'FUNCTION public.studio_flow_marketplace_get_compact_listings()');
  definition := replace(definition, '''portfolioPaths'', ' || portfolio_expression,
    '''portfolioPaths'', array[]::text[]');
  definition := replace(definition, '''portfolio_paths'', ' || portfolio_expression,
    '''portfolio_paths'', array[]::text[]');
  definition := replace(definition, '''photo_path'', ' || photo_expression,
    '''photo_path'', null::text');
  definition := replace(definition, '''photoPath'', ' || photo_expression,
    '''photoPath'', null::text');

  execute definition;
end;
$migration$;

create or replace function public.studio_flow_marketplace_get_listing_portfolio(p_listing_id uuid)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
    case when mp.profile_type = 'studio'
      then to_jsonb(sp.gallery_paths)
      else to_jsonb(ap.portfolio_paths)
    end,
    '[]'::jsonb
  )
  from marketplace_listings ml
  join marketplace_profiles mp on mp.id = ml.marketplace_profile_id
  left join artist_studio_memberships membership
    on membership.id = coalesce(ml.membership_id, mp.membership_id)
  left join artist_profiles ap
    on ap.artist_id = coalesce(ml.artist_id, mp.artist_id, membership.artist_id)
  left join studio_profiles sp
    on sp.studio_id = coalesce(ml.studio_id, mp.studio_id, membership.studio_id)
  where ml.id = p_listing_id
    and auth.uid() is not null
    and ml.visibility_status = 'visible'
    and mp.visibility_status = 'visible'
    and (ml.expires_at is null or ml.expires_at > now());
$$;

revoke execute on function public.studio_flow_marketplace_get_compact_listings() from public, anon;
revoke execute on function public.studio_flow_marketplace_get_listing_portfolio(uuid) from public, anon;
grant execute on function public.studio_flow_marketplace_get_compact_listings() to authenticated;
grant execute on function public.studio_flow_marketplace_get_listing_portfolio(uuid) to authenticated;
