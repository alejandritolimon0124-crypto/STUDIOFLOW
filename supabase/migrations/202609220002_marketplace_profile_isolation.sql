begin;

do $migration$
declare
  d text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure) into d;

  if position('sp.gallery_paths as studio_gallery_paths,' in d) = 0 then
    d := replace(
      d,
      'sp.logo_path,',
      E'sp.logo_path,\n      sp.gallery_paths as studio_gallery_paths,\n      sp.email as studio_email,'
    );
  end if;

  d := replace(
    d,
    '''city'', coalesce(city, artist_city, studio_city),',
    '''city'', case when profile_type = ''studio'' then coalesce(city, studio_city) else coalesce(city, artist_city) end,'
  );
  d := replace(
    d,
    '''portfolioPaths'', coalesce(portfolio_paths, array[]::text[]),',
    '''portfolioPaths'', case when profile_type = ''studio'' then coalesce(studio_gallery_paths, array[]::text[]) else coalesce(portfolio_paths, array[]::text[]) end,'
  );
  d := replace(
    d,
    '''portfolio_paths'', coalesce(portfolio_paths, array[]::text[]),',
    '''portfolio_paths'', case when profile_type = ''studio'' then coalesce(studio_gallery_paths, array[]::text[]) else coalesce(portfolio_paths, array[]::text[]) end,'
  );
  d := replace(
    d,
    '''specialties'', coalesce(specialties, array[]::text[]),',
    '''specialties'', case when profile_type = ''studio'' then array[]::text[] else coalesce(specialties, array[]::text[]) end,'
  );
  d := replace(
    d,
    '''primarySpecialty'', primary_specialty,',
    '''primarySpecialty'', case when profile_type = ''studio'' then null else primary_specialty end,'
  );
  d := replace(
    d,
    '''primary_specialty'', primary_specialty,',
    '''primary_specialty'', case when profile_type = ''studio'' then null else primary_specialty end,'
  );
  d := replace(
    d,
    '''whatsapp'', case when profile_type = ''studio'' then coalesce(studio_whatsapp, whatsapp) else whatsapp end,',
    '''whatsapp'', case when profile_type = ''studio'' then studio_whatsapp else whatsapp end,'
  );
  d := replace(
    d,
    '''instagram'', case when profile_type = ''studio'' then coalesce(studio_instagram, instagram) else instagram end,',
    '''instagram'', case when profile_type = ''studio'' then studio_instagram else instagram end,'
  );
  d := replace(
    d,
    '''facebook'', case when profile_type = ''studio'' then coalesce(studio_facebook, facebook) else facebook end,',
    '''facebook'', case when profile_type = ''studio'' then studio_facebook else facebook end,'
  );
  d := replace(
    d,
    '''tiktok'', case when profile_type = ''studio'' then coalesce(studio_tiktok, tiktok) else tiktok end,',
    '''tiktok'', case when profile_type = ''studio'' then studio_tiktok else tiktok end,'
  );
  d := replace(
    d,
    '''website'', website',
    '''website'', case when profile_type = ''studio'' then null else website end'
  );
  d := replace(
    d,
    '''useStudioLocation'', use_studio_location,',
    '''useStudioLocation'', case when profile_type = ''studio'' then false else use_studio_location end,'
  );
  d := replace(
    d,
    '''use_studio_location'', use_studio_location,',
    '''use_studio_location'', case when profile_type = ''studio'' then false else use_studio_location end,'
  );
  d := replace(
    d,
    '''state'', artist_state,',
    '''state'', case when profile_type = ''studio'' then null else artist_state end,'
  );
  d := replace(
    d,
    '''postalCode'', artist_postal_code,',
    '''postalCode'', case when profile_type = ''studio'' then null else artist_postal_code end,'
  );
  d := replace(
    d,
    '''postal_code'', artist_postal_code,',
    '''postal_code'', case when profile_type = ''studio'' then null else artist_postal_code end,'
  );
  d := replace(
    d,
    '''googleMapsUrl'', artist_google_maps_url,',
    '''googleMapsUrl'', case when profile_type = ''studio'' then null else artist_google_maps_url end,'
  );
  d := replace(
    d,
    '''google_maps_url'', artist_google_maps_url',
    '''google_maps_url'', case when profile_type = ''studio'' then null else artist_google_maps_url end'
  );

  d := replace(
    d,
    '''biography'', case when profile_type = ''studio'' then studio_description else artist_bio end,',
    E'''phone'', case when profile_type = ''studio'' then studio_phone else null end,\n          ''email'', case when profile_type = ''studio'' then studio_email else null end,\n          ''biography'', case when profile_type = ''studio'' then studio_description else artist_bio end,'
  );
  d := replace(
    d,
    '''description'', studio_description,',
    E'''description'', studio_description,\n            ''email'', studio_email,\n            ''gallery'', coalesce(to_jsonb(studio_gallery_paths), ''[]''::jsonb),\n            ''galleryPaths'', coalesce(to_jsonb(studio_gallery_paths), ''[]''::jsonb),'
  );

  execute d;
end;
$migration$;

grant execute on function public.studio_flow_marketplace_get_listings() to anon, authenticated;

commit;
