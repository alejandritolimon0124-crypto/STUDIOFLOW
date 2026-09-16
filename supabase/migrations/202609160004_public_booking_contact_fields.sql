do $migration$
declare d text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure) into d;
  if position('sp.description as studio_description,' in d) > 0 and position('sp.phone as studio_phone,' in d) = 0 then
    d := replace(d, 'sp.description as studio_description,', E'sp.description as studio_description,\n      sp.phone as studio_phone,');
  end if;
  if position('''city'', coalesce(city, artist_city, studio_city),' in d) > 0 and position('''phone'', coalesce(whatsapp, studio_phone),' in d) = 0 then
    d := replace(d, '''city'', coalesce(city, artist_city, studio_city),', E'''city'', coalesce(city, artist_city, studio_city),\n        ''phone'', coalesce(whatsapp, studio_phone),');
  end if;
  if position('''description'', studio_description,' in d) > 0 and position('''phone'', studio_phone,' in d) = 0 then
    d := replace(d, '''description'', studio_description,', E'''description'', studio_description,\n            ''phone'', studio_phone,');
  end if;
  execute d;
end $migration$;

grant execute on function public.studio_flow_marketplace_get_listings() to anon;
