begin;

-- Public discovery uses validated SECURITY DEFINER RPCs, not raw tables.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all privileges on table public.%I from anon, public', t.tablename);
    -- Studio profile editing still uses a direct upsert and needs scoped policies separately.
    if t.tablename <> 'studio_profiles' then
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', t.tablename);
    end if;
    -- Retain only the direct reads currently used by the studio service and realtime appointments.
    if t.tablename not in ('appointments', 'clients', 'artists', 'service_offerings', 'studio_profiles') then
      execute format('revoke select on table public.%I from authenticated', t.tablename);
    end if;
  end loop;
end $$;

commit;
