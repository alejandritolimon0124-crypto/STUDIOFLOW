create or replace function public.studio_flow_phone_key(p_phone text)
returns text language sql immutable set search_path = public as $$
  select case
    when length(digits) = 12 and left(digits, 2) = '52' then right(digits, 10)
    when length(digits) = 13 and left(digits, 3) = '521' then right(digits, 10)
    else digits
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') digits) normalized;
$$;

create or replace function public.studio_flow_phone_in_use(p_phone text, p_role text, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.studio_flow_phone_key(p_phone) <> '' and exists (
    select 1
    from auth.users u
    left join profiles p on p.id = u.id
    left join clients c on c.profile_id = u.id
    where u.id is distinct from p_exclude
      and (
        (p_role = 'artist' and (
          u.raw_user_meta_data->>'default_role' = 'artist'
          or exists (select 1 from artists a where a.profile_id = u.id)
        ) and public.studio_flow_phone_key(coalesce(nullif(p.phone, ''), u.raw_user_meta_data->>'phone')) = public.studio_flow_phone_key(p_phone))
        or
        (p_role = 'client' and (
          u.raw_user_meta_data->>'default_role' = 'client' or c.id is not null
        ) and public.studio_flow_phone_key(coalesce(nullif(c.phone, ''), nullif(p.phone, ''), u.raw_user_meta_data->>'phone')) = public.studio_flow_phone_key(p_phone))
      )
  );
$$;
revoke all on function public.studio_flow_phone_in_use(text, text, uuid) from public;

create or replace function public.studio_flow_check_registration_phone(p_phone text, p_role text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if p_role not in ('artist', 'client') then raise exception 'Tipo de perfil invalido'; end if;
  return not public.studio_flow_phone_in_use(p_phone, p_role, null);
end;
$$;
revoke all on function public.studio_flow_check_registration_phone(text, text) from public;
grant execute on function public.studio_flow_check_registration_phone(text, text) to anon, authenticated;

create or replace function public.studio_flow_assert_phone_available(p_phone text, p_role text, p_profile_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if public.studio_flow_phone_key(p_phone) = '' then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(public.studio_flow_phone_key(p_phone) || ':' || p_role, 0));
  if public.studio_flow_phone_in_use(p_phone, p_role, p_profile_id) then
    raise exception 'Ese número ya está en uso por otro perfil' using errcode = '23505';
  end if;
end;
$$;
revoke all on function public.studio_flow_assert_phone_available(text, text, uuid) from public;

create or replace function public.studio_flow_guard_account_phone()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_phone text; v_role text; v_id uuid;
begin
  if tg_table_schema = 'auth' then
    v_role := new.raw_user_meta_data->>'default_role';
    v_phone := new.raw_user_meta_data->>'phone';
    v_id := new.id;
    if tg_op = 'UPDATE' and
      public.studio_flow_phone_key(v_phone) = public.studio_flow_phone_key(old.raw_user_meta_data->>'phone')
      and v_role is not distinct from old.raw_user_meta_data->>'default_role' then return new; end if;
    if v_role in ('artist', 'client') then
      perform public.studio_flow_assert_phone_available(v_phone, v_role, v_id);
    end if;
  elsif tg_table_name = 'artists' then
    if tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id then return new; end if;
    select phone into v_phone from profiles where id = new.profile_id;
    perform public.studio_flow_assert_phone_available(v_phone, 'artist', new.profile_id);
  elsif tg_table_name = 'clients' then
    if new.profile_id is null then return new; end if;
    if tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id
      and public.studio_flow_phone_key(new.phone) = public.studio_flow_phone_key(old.phone) then return new; end if;
    select coalesce(nullif(new.phone, ''), phone) into v_phone from profiles where id = new.profile_id;
    perform public.studio_flow_assert_phone_available(v_phone, 'client', new.profile_id);
  else
    if tg_op = 'UPDATE' and public.studio_flow_phone_key(new.phone) = public.studio_flow_phone_key(old.phone) then return new; end if;
    if exists (select 1 from artists where profile_id = new.id) then
      perform public.studio_flow_assert_phone_available(new.phone, 'artist', new.id);
    end if;
    if exists (select 1 from clients where profile_id = new.id) then
      perform public.studio_flow_assert_phone_available(new.phone, 'client', new.id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.studio_flow_guard_account_phone() from public;

create trigger studio_flow_auth_phone_guard before insert or update of raw_user_meta_data on auth.users
for each row execute function public.studio_flow_guard_account_phone();
create trigger studio_flow_artist_phone_guard before insert or update of profile_id on public.artists
for each row execute function public.studio_flow_guard_account_phone();
create trigger studio_flow_client_phone_guard before insert or update of phone, profile_id on public.clients
for each row execute function public.studio_flow_guard_account_phone();
create trigger studio_flow_profile_phone_guard before insert or update of phone on public.profiles
for each row execute function public.studio_flow_guard_account_phone();
