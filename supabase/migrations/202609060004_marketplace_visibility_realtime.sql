do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_profiles') then
    alter publication supabase_realtime add table public.marketplace_profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_listings') then
    alter publication supabase_realtime add table public.marketplace_listings;
  end if;
end;
$$;
