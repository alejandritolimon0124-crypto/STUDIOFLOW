create or replace function public.studio_flow_owner_get_studio_memberships(
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_memberships jsonb;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', asm.id,
        'membershipId', asm.id,
        'membership_id', asm.id,
        'artistId', a.id,
        'artist_id', a.id,
        'profileId', p.id,
        'profile_id', p.id,
        'name', coalesce(ap.artistic_name, a.display_name, p.display_name, p.email, 'Artista'),
        'email', p.email,
        'photoUrl', ap.photo_path,
        'photo_url', ap.photo_path,
        'studioPhotoUrl', coalesce(
          nullif(ap.studio_photo_paths ->> v_studio_id::text, ''),
          nullif(ap.studio_photo_paths ->> asm.id::text, '')
        ),
        'studio_photo_url', coalesce(
          nullif(ap.studio_photo_paths ->> v_studio_id::text, ''),
          nullif(ap.studio_photo_paths ->> asm.id::text, '')
        ),
        'role', asm.role,
        'status', asm.status::text,
        'startedAt', asm.started_at,
        'started_at', asm.started_at,
        'createdAt', asm.created_at,
        'created_at', asm.created_at,
        'active', asm.status::text = 'active' and asm.archived_at is null
      )
      order by asm.created_at desc
    ),
    '[]'::jsonb
  )
  into v_memberships
  from artist_studio_memberships asm
  join artists a on a.id = asm.artist_id
  left join profiles p on p.id = a.profile_id
  left join artist_profiles ap on ap.artist_id = a.id
  where asm.studio_id = v_studio_id
    and asm.archived_at is null
    and asm.status::text = 'active';

  return jsonb_build_object(
    'studioId', v_studio_id,
    'studio_id', v_studio_id,
    'memberships', v_memberships,
    'invitations', '[]'::jsonb,
    'artistCandidates', '[]'::jsonb,
    'artist_candidates', '[]'::jsonb
  );
end;
$$;

revoke all on function public.studio_flow_owner_get_studio_memberships(uuid) from public;
grant execute on function public.studio_flow_owner_get_studio_memberships(uuid) to authenticated;

notify pgrst, 'reload schema';
