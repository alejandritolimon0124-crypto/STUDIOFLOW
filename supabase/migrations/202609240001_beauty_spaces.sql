begin;

alter table public.artist_profiles add column if not exists beauty_space text not null default 'beauty_and_personal_care';
alter table public.studio_profiles add column if not exists beauty_space text not null default 'beauty_and_personal_care';

alter table public.artist_profiles drop constraint if exists artist_profiles_beauty_space_check;
alter table public.artist_profiles add constraint artist_profiles_beauty_space_check check (beauty_space in ('beauty_and_personal_care', 'spa_and_advanced_aesthetics'));
alter table public.studio_profiles drop constraint if exists studio_profiles_beauty_space_check;
alter table public.studio_profiles add constraint studio_profiles_beauty_space_check check (beauty_space in ('beauty_and_personal_care', 'spa_and_advanced_aesthetics'));

create or replace function public.studio_flow_set_own_artist_beauty_space(p_beauty_space text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if p_beauty_space not in ('beauty_and_personal_care', 'spa_and_advanced_aesthetics') then
    raise exception 'Beauty space no válido';
  end if;
  update public.artist_profiles ap set beauty_space = p_beauty_space, updated_at = now()
  from public.artists a where ap.artist_id = a.id and a.profile_id = auth.uid() and a.archived_at is null;
  if not found then raise exception 'No se encontró el perfil de artista'; end if;
end;
$$;

create or replace function public.studio_flow_marketplace_get_beauty_spaces()
returns table(entity_type text, entity_id uuid, beauty_space text)
language sql security definer stable set search_path = public as $$
  select 'artist'::text, artist_id, beauty_space from public.artist_profiles
  union all
  select 'studio'::text, studio_id, beauty_space from public.studio_profiles;
$$;

revoke all on function public.studio_flow_set_own_artist_beauty_space(text) from public, anon;
grant execute on function public.studio_flow_set_own_artist_beauty_space(text) to authenticated;
revoke all on function public.studio_flow_marketplace_get_beauty_spaces() from public;
grant execute on function public.studio_flow_marketplace_get_beauty_spaces() to anon, authenticated;

commit;
