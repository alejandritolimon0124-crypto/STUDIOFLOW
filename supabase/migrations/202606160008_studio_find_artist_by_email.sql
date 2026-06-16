create or replace function public.studio_flow_owner_find_artist_by_email(
  p_studio_id uuid default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_email text;
  v_artist jsonb;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));

  if v_email is null then
    raise exception 'Artist email is required';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'artistId', a.id,
    'artist_id', a.id,
    'profileId', p.id,
    'profile_id', p.id,
    'name', coalesce(ap.artistic_name, a.display_name, p.display_name, p.email, 'Artista'),
    'email', p.email,
    'photoUrl', ap.photo_path,
    'photo_url', ap.photo_path,
    'city', ap.city,
    'status', a.status,
    'membershipStatus', asm.status,
    'membership_status', asm.status,
    'alreadyMember', asm.id is not null and asm.status = 'active' and asm.archived_at is null,
    'already_member', asm.id is not null and asm.status = 'active' and asm.archived_at is null
  )
  into v_artist
  from profiles p
  join artists a on a.profile_id = p.id
  left join artist_profiles ap on ap.artist_id = a.id
  left join artist_studio_memberships asm on asm.artist_id = a.id
    and asm.studio_id = v_studio_id
    and asm.archived_at is null
  where lower(p.email) = v_email
    and p.status = 'active'
    and a.status = 'active'
    and a.archived_at is null
  order by a.created_at desc
  limit 1;

  return jsonb_build_object(
    'studioId', v_studio_id,
    'studio_id', v_studio_id,
    'artist', v_artist
  );
end;
$$;

revoke all on function public.studio_flow_owner_find_artist_by_email(uuid, text) from public;
grant execute on function public.studio_flow_owner_find_artist_by_email(uuid, text) to authenticated;
