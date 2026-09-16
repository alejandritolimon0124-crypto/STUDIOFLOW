-- Expose only already-published marketplace profiles and their calculated availability.
do $migration$
declare
  d text;
  guard text := E'  if auth.uid() is null then\n    raise exception ''Auth session required'';\n  end if;\n';
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure) into d;
  if position(guard in d) > 0 then d := replace(d, guard, ''); execute d; end if;

  select pg_get_functiondef('public.studio_flow_marketplace_get_availability(uuid,uuid,date)'::regprocedure) into d;
  if position(guard in d) > 0 then d := replace(d, guard, ''); execute d; end if;
end $migration$;

revoke all on function public.studio_flow_marketplace_get_listings() from anon;
grant execute on function public.studio_flow_marketplace_get_listings() to anon;
revoke all on function public.studio_flow_marketplace_get_availability(uuid,uuid,date) from anon;
grant execute on function public.studio_flow_marketplace_get_availability(uuid,uuid,date) to anon;
