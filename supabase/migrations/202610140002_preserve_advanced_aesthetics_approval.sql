create or replace function public.studio_flow_set_own_artist_beauty_space(
  p_beauty_spaces text[], p_has_health_officer boolean default false,
  p_health_officer_name text default null, p_health_officer_title text default null,
  p_health_officer_license text default null
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  previous_profile public.artist_profiles%rowtype;
  normalized_name text := nullif(trim(p_health_officer_name), '');
  normalized_title text := nullif(trim(p_health_officer_title), '');
  normalized_license text := nullif(trim(p_health_officer_license), '');
  requires_review boolean;
begin
  if coalesce(array_length(p_beauty_spaces, 1), 0) = 0
    or not (p_beauty_spaces && array['beauty_and_personal_care', 'spa_and_advanced_aesthetics']::text[])
    or exists (select 1 from unnest(p_beauty_spaces) value where value not in ('beauty_and_personal_care', 'spa_and_advanced_aesthetics')) then
    raise exception 'Beauty spaces no válidos';
  end if;
  if 'spa_and_advanced_aesthetics' = any(p_beauty_spaces) and (
    not coalesce(p_has_health_officer, false) or normalized_name is null
    or normalized_title is null or normalized_license is null
  ) then raise exception 'Estética avanzada requiere los datos completos del responsable sanitario'; end if;

  select ap.* into previous_profile
  from public.artist_profiles ap
  join public.artists a on a.id = ap.artist_id
  where a.profile_id = auth.uid() and a.archived_at is null
  for update of ap;
  if not found then raise exception 'No se encontró el perfil de artista'; end if;

  requires_review := 'spa_and_advanced_aesthetics' = any(p_beauty_spaces) and (
    not ('spa_and_advanced_aesthetics' = any(previous_profile.beauty_spaces))
    or previous_profile.has_health_officer is distinct from coalesce(p_has_health_officer, false)
    or previous_profile.health_officer_name is distinct from normalized_name
    or previous_profile.health_officer_title is distinct from normalized_title
    or previous_profile.health_officer_license is distinct from normalized_license
  );

  update public.artist_profiles ap set
    beauty_spaces = p_beauty_spaces, beauty_space = p_beauty_spaces[1],
    has_health_officer = coalesce(p_has_health_officer, false),
    health_officer_name = normalized_name,
    health_officer_title = normalized_title,
    health_officer_license = normalized_license, updated_at = now()
  where ap.artist_id = previous_profile.artist_id;

  if requires_review then
    update public.artists set status = 'pending', updated_at = now()
    where id = previous_profile.artist_id and archived_at is null and status <> 'pending';
  end if;
end;
$$;
