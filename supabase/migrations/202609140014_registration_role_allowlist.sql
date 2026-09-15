begin;
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare v_default_role profile_default_role;
begin
  -- User metadata is untrusted: administrative roles never originate here.
  v_default_role := case when new.raw_user_meta_data->>'default_role' = 'artist'
    then 'artist'::profile_default_role else 'client'::profile_default_role end;
  insert into profiles (id, display_name, email, phone, default_role)
  values (new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''),new.email),
    lower(new.email),nullif(new.raw_user_meta_data->>'phone',''),v_default_role)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
commit;
