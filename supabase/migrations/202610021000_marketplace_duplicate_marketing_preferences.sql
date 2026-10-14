begin;

do $migration$
declare
  d text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure) into d;

  d := replace(
    d,
    '(select amp.point_redemption_scope from artist_marketing_preferences amp where amp.artist_id = artist_id)',
    '(select max(amp.point_redemption_scope) from artist_marketing_preferences amp where amp.artist_id = artist_id)'
  );

  execute d;
end;
$migration$;

grant execute on function public.studio_flow_marketplace_get_listings() to anon, authenticated;

commit;
