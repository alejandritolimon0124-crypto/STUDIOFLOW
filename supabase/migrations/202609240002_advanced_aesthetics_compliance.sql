begin;

alter table public.artist_profiles
  add column if not exists beauty_spaces text[] not null default array['beauty_and_personal_care']::text[],
  add column if not exists has_health_officer boolean not null default false,
  add column if not exists health_officer_name text,
  add column if not exists health_officer_title text,
  add column if not exists health_officer_license text;

alter table public.studio_profiles
  add column if not exists beauty_spaces text[] not null default array['beauty_and_personal_care']::text[],
  add column if not exists has_health_officer boolean not null default false,
  add column if not exists health_officer_name text,
  add column if not exists health_officer_title text,
  add column if not exists health_officer_license text;

update public.artist_profiles set beauty_spaces = array[beauty_space] where beauty_space is not null;
update public.studio_profiles set beauty_spaces = array[beauty_space] where beauty_space is not null;

drop function if exists public.studio_flow_set_own_artist_beauty_space(text);
create function public.studio_flow_set_own_artist_beauty_space(
  p_beauty_spaces text[], p_has_health_officer boolean default false,
  p_health_officer_name text default null, p_health_officer_title text default null,
  p_health_officer_license text default null
) returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if coalesce(array_length(p_beauty_spaces, 1), 0) = 0
    or not (p_beauty_spaces && array['beauty_and_personal_care', 'spa_and_advanced_aesthetics']::text[])
    or exists (select 1 from unnest(p_beauty_spaces) value where value not in ('beauty_and_personal_care', 'spa_and_advanced_aesthetics')) then
    raise exception 'Beauty spaces no válidos';
  end if;
  if 'spa_and_advanced_aesthetics' = any(p_beauty_spaces) and (
    not coalesce(p_has_health_officer, false) or nullif(trim(p_health_officer_name), '') is null
    or nullif(trim(p_health_officer_title), '') is null or nullif(trim(p_health_officer_license), '') is null
  ) then raise exception 'Estética avanzada requiere los datos completos del responsable sanitario'; end if;

  update public.artist_profiles ap set
    beauty_spaces = p_beauty_spaces, beauty_space = p_beauty_spaces[1],
    has_health_officer = coalesce(p_has_health_officer, false),
    health_officer_name = nullif(trim(p_health_officer_name), ''),
    health_officer_title = nullif(trim(p_health_officer_title), ''),
    health_officer_license = nullif(trim(p_health_officer_license), ''), updated_at = now()
  from public.artists a where ap.artist_id = a.id and a.profile_id = auth.uid() and a.archived_at is null;
  if not found then raise exception 'No se encontró el perfil de artista'; end if;

  if 'spa_and_advanced_aesthetics' = any(p_beauty_spaces) then
    update public.artists set status = 'pending', updated_at = now()
    where profile_id = auth.uid() and archived_at is null and status <> 'pending';
  end if;
end;
$$;

drop function if exists public.studio_flow_marketplace_get_beauty_spaces();
create function public.studio_flow_marketplace_get_beauty_spaces()
returns table(entity_type text, entity_id uuid, beauty_spaces text[])
language sql security definer stable set search_path = public as $$
  select 'artist'::text, artist_id, beauty_spaces from public.artist_profiles
  union all select 'studio'::text, studio_id, beauty_spaces from public.studio_profiles;
$$;

create or replace function public.studio_flow_require_advanced_aesthetics_compliance()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' and exists (
    select 1 from public.artist_profiles ap where ap.artist_id = new.id
      and 'spa_and_advanced_aesthetics' = any(ap.beauty_spaces)
      and (not ap.has_health_officer or nullif(trim(ap.health_officer_name), '') is null
        or nullif(trim(ap.health_officer_title), '') is null or nullif(trim(ap.health_officer_license), '') is null)
  ) then raise exception 'No se puede aprobar estética avanzada sin validar al responsable sanitario'; end if;
  return new;
end;
$$;

create or replace function public.studio_flow_admin_get_health_compliance()
returns table(
  artist_id uuid, beauty_spaces text[], has_health_officer boolean,
  health_officer_name text, health_officer_title text, health_officer_license text
) language plpgsql security definer stable set search_path = public, auth as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.default_role = 'platform_owner'
  ) and not exists (
    select 1 from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
    where ura.profile_id = auth.uid() and ura.status = 'active' and r.code = 'platform_owner'
  ) then raise exception 'Acceso de dueño requerido'; end if;

  return query select ap.artist_id, ap.beauty_spaces, ap.has_health_officer,
    ap.health_officer_name, ap.health_officer_title, ap.health_officer_license
  from public.artist_profiles ap;
end;
$$;

drop trigger if exists require_advanced_aesthetics_compliance on public.artists;
create trigger require_advanced_aesthetics_compliance before update of status on public.artists
for each row execute function public.studio_flow_require_advanced_aesthetics_compliance();

revoke all on function public.studio_flow_set_own_artist_beauty_space(text[], boolean, text, text, text) from public, anon;
grant execute on function public.studio_flow_set_own_artist_beauty_space(text[], boolean, text, text, text) to authenticated;
revoke all on function public.studio_flow_marketplace_get_beauty_spaces() from public;
grant execute on function public.studio_flow_marketplace_get_beauty_spaces() to anon, authenticated;
revoke all on function public.studio_flow_admin_get_health_compliance() from public, anon;
grant execute on function public.studio_flow_admin_get_health_compliance() to authenticated;

commit;
