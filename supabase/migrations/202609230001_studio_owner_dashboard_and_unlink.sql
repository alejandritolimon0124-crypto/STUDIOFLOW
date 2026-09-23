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
        'name', coalesce(p.display_name, a.display_name, p.email, 'Artista'),
        'realName', coalesce(p.display_name, a.display_name, p.email, 'Artista'),
        'real_name', coalesce(p.display_name, a.display_name, p.email, 'Artista'),
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

create or replace function public.studio_flow_owner_unlink_artist(
  p_studio_id uuid,
  p_membership_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_membership artist_studio_memberships%rowtype;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  select *
  into v_membership
  from artist_studio_memberships
  where id = p_membership_id
    and studio_id = v_studio_id
    and archived_at is null
    and status::text = 'active'
  for update;

  if v_membership.id is null then
    raise exception 'La artista ya no tiene una vinculacion activa con este estudio.';
  end if;

  update artist_studio_memberships
  set status = 'inactive',
      ended_at = current_date,
      archived_at = now(),
      updated_at = now()
  where id = v_membership.id;

  update service_offerings
  set status = 'archived', archived_at = now(), updated_at = now()
  where membership_id = v_membership.id
    and status::text <> 'archived';

  update schedules
  set status = 'archived', archived_at = now(), updated_at = now()
  where membership_id = v_membership.id
    and status::text <> 'archived';

  update availability_slots
  set status = 'hidden', updated_at = now()
  where membership_id = v_membership.id
    and starts_at >= now()
    and status::text in ('available', 'held');

  update artist_profiles
  set studio_photo_paths = coalesce(studio_photo_paths, '{}'::jsonb)
      - v_studio_id::text
      - v_membership.id::text,
      use_studio_location = case
        when exists (
          select 1
          from artist_studio_memberships other_membership
          where other_membership.artist_id = v_membership.artist_id
            and other_membership.id <> v_membership.id
            and other_membership.status::text = 'active'
            and other_membership.archived_at is null
        ) then use_studio_location
        else false
      end,
      updated_at = now()
  where artist_id = v_membership.artist_id;

  return public.studio_flow_owner_get_studio_memberships(v_studio_id);
end;
$$;

revoke all on function public.studio_flow_owner_get_studio_memberships(uuid) from public;
revoke all on function public.studio_flow_owner_unlink_artist(uuid, uuid) from public;
grant execute on function public.studio_flow_owner_get_studio_memberships(uuid) to authenticated;
grant execute on function public.studio_flow_owner_unlink_artist(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
