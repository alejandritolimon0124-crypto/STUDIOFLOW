begin;

do $migration$
declare
  d text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure) into d;

  d := replace(
    d,
    E'sp.logo_path,\n      sp.gallery_paths as studio_gallery_paths,\n      sp.email as studio_email,\n      sp.phone as studio_phone,',
    E'sp.logo_path,\n      sp.gallery_paths as studio_gallery_paths,\n      sp.email as studio_email,'
  );

  d := replace(
    d,
    E'''email'', studio_email,\n            ''phone'', studio_phone,\n            ''gallery'', coalesce(to_jsonb(studio_gallery_paths), ''[]''::jsonb),\n            ''galleryPaths'', coalesce(to_jsonb(studio_gallery_paths), ''[]''::jsonb),\n            ''phone'', studio_phone,',
    E'''email'', studio_email,\n            ''gallery'', coalesce(to_jsonb(studio_gallery_paths), ''[]''::jsonb),\n            ''galleryPaths'', coalesce(to_jsonb(studio_gallery_paths), ''[]''::jsonb),\n            ''phone'', studio_phone,'
  );

  execute d;
end;
$migration$;

grant execute on function public.studio_flow_marketplace_get_listings() to anon, authenticated;

commit;
