alter table artist_claim_invitations
  alter column artist_id drop not null;

alter table audit_events
  drop constraint if exists audit_events_entity_type_check;

alter table audit_events
  add constraint audit_events_entity_type_check
  check (
    entity_type in (
      'profile',
      'role',
      'permission',
      'role_permission',
      'user_role_assignment',
      'studio',
      'studio_profile',
      'governance_review',
      'artist',
      'artist_profile',
      'artist_studio_membership',
      'artist_claim_invitation',
      'service_category',
      'service_tier',
      'service_offering',
      'schedule',
      'schedule_rule',
      'calendar_block',
      'availability_slot',
      'appointment',
      'appointment_status_event',
      'client',
      'client_profile',
      'customer_relationship',
      'customer_private_note',
      'favorite_artist',
      'marketplace_profile',
      'marketplace_listing',
      'appointment_economy',
      'commission',
      'loyalty_account',
      'flow_point_ledger_entry',
      'reward',
      'reward_redemption',
      'promotion',
      'risk_flag',
      'sanction',
      'no_show_case',
      'audit_event'
    )
  );

create or replace function public.studio_flow_owner_assert_studio_access(
  p_studio_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_studio_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select s.id
  into v_studio_id
  from studios s
  where s.archived_at is null
    and (p_studio_id is null or s.id = p_studio_id)
    and (
      s.owner_profile_id = v_profile.id
      or exists (
        select 1
        from user_role_assignments ura
        join roles r on r.id = ura.role_id
        where ura.profile_id = v_profile.id
          and ura.studio_id = s.id
          and ura.status = 'active'
          and r.code = 'studio_owner'
      )
    )
  order by s.created_at desc
  limit 1;

  if v_studio_id is null then
    raise exception 'Studio owner access required';
  end if;

  return v_studio_id;
end;
$$;

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
  v_invitations jsonb;
  v_candidates jsonb;
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
        'role', asm.role,
        'status', asm.status,
        'startedAt', asm.started_at,
        'started_at', asm.started_at,
        'createdAt', asm.created_at,
        'created_at', asm.created_at,
        'active', asm.status = 'active' and asm.archived_at is null
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
    and asm.archived_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', invitation.id,
        'token', invitation.token,
        'artistId', invitation.artist_id,
        'artist_id', invitation.artist_id,
        'membershipId', invitation.membership_id,
        'membership_id', invitation.membership_id,
        'invitedEmail', invitation.invited_email,
        'invited_email', invitation.invited_email,
        'status', invitation.status,
        'createdAt', invitation.created_at,
        'created_at', invitation.created_at,
        'expiresAt', invitation.expires_at,
        'expires_at', invitation.expires_at,
        'artistName', coalesce(ap.artistic_name, a.display_name, artist_profile.display_name),
        'artist_name', coalesce(ap.artistic_name, a.display_name, artist_profile.display_name)
      )
      order by invitation.created_at desc
    ),
    '[]'::jsonb
  )
  into v_invitations
  from artist_claim_invitations invitation
  left join artists a on a.id = invitation.artist_id
  left join profiles artist_profile on artist_profile.id = a.profile_id
  left join artist_profiles ap on ap.artist_id = a.id
  where invitation.studio_id = v_studio_id
    and invitation.status = 'pending'
    and invitation.expires_at > now();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'artistId', a.id,
        'artist_id', a.id,
        'name', coalesce(ap.artistic_name, a.display_name, p.display_name, p.email, 'Artista'),
        'email', p.email,
        'photoUrl', ap.photo_path,
        'photo_url', ap.photo_path,
        'city', ap.city
      )
      order by coalesce(ap.artistic_name, a.display_name, p.display_name, p.email)
    ),
    '[]'::jsonb
  )
  into v_candidates
  from artists a
  join profiles p on p.id = a.profile_id
  left join artist_profiles ap on ap.artist_id = a.id
  where a.status = 'active'
    and a.archived_at is null
    and p.email is not null
    and not exists (
      select 1
      from artist_studio_memberships asm
      where asm.artist_id = a.id
        and asm.studio_id = v_studio_id
        and asm.status = 'active'
        and asm.archived_at is null
    )
  limit 50;

  return jsonb_build_object(
    'studioId', v_studio_id,
    'studio_id', v_studio_id,
    'memberships', v_memberships,
    'invitations', v_invitations,
    'artistCandidates', v_candidates,
    'artist_candidates', v_candidates
  );
end;
$$;

create or replace function public.studio_flow_owner_invite_artist(
  p_studio_id uuid default null,
  p_invited_email text default null,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_studio_id uuid;
  v_artist artists%rowtype;
  v_artist_profile profiles%rowtype;
  v_email text;
  v_invitation artist_claim_invitations%rowtype;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  select *
  into v_profile
  from profiles
  where id = auth.uid();

  if p_artist_id is not null then
    select *
    into v_artist
    from artists
    where id = p_artist_id
      and status = 'active'
      and archived_at is null;

    if v_artist.id is null then
      raise exception 'Registered artist not found';
    end if;

    select *
    into v_artist_profile
    from profiles
    where id = v_artist.profile_id
      and status = 'active';
  end if;

  v_email := lower(nullif(trim(coalesce(p_invited_email, v_artist_profile.email, '')), ''));

  if v_email is null then
    raise exception 'Artist email is required';
  end if;

  if p_artist_id is not null and exists (
    select 1
    from artist_studio_memberships asm
    where asm.artist_id = p_artist_id
      and asm.studio_id = v_studio_id
      and asm.status = 'active'
      and asm.archived_at is null
  ) then
    raise exception 'Artist already belongs to this studio';
  end if;

  if exists (
    select 1
    from artist_claim_invitations invitation
    where invitation.studio_id = v_studio_id
      and lower(invitation.invited_email) = v_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email';
  end if;

  insert into artist_claim_invitations (
    artist_id,
    studio_id,
    invited_email,
    invited_by_profile_id
  )
  values (
    p_artist_id,
    v_studio_id,
    v_email,
    v_profile.id
  )
  returning *
  into v_invitation;

  perform public.studio_flow_record_claim_audit(
    'artist_claim_invited',
    v_invitation,
    v_profile.id,
    jsonb_build_object('source', 'studio_owner_panel')
  );

  return public.studio_flow_owner_get_studio_memberships(v_studio_id)
    || jsonb_build_object(
      'lastInvitation', jsonb_build_object(
        'id', v_invitation.id,
        'token', v_invitation.token,
        'invitedEmail', v_invitation.invited_email,
        'invited_email', v_invitation.invited_email,
        'expiresAt', v_invitation.expires_at,
        'expires_at', v_invitation.expires_at
      ),
      'last_invitation', jsonb_build_object(
        'id', v_invitation.id,
        'token', v_invitation.token,
        'invitedEmail', v_invitation.invited_email,
        'invited_email', v_invitation.invited_email,
        'expiresAt', v_invitation.expires_at,
        'expires_at', v_invitation.expires_at
      )
    );
end;
$$;

create or replace function public.studio_flow_owner_cancel_artist_invitation(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_invitation artist_claim_invitations%rowtype;
  v_studio_id uuid;
begin
  if p_invitation_id is null then
    raise exception 'Invitation is required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_invitation
  from artist_claim_invitations
  where id = p_invitation_id
  for update;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  v_studio_id := public.studio_flow_owner_assert_studio_access(v_invitation.studio_id);

  if v_invitation.status <> 'pending' then
    raise exception 'Only pending invitations can be cancelled';
  end if;

  update artist_claim_invitations
  set
    status = 'revoked',
    revoked_at = now()
  where id = v_invitation.id
  returning *
  into v_invitation;

  perform public.studio_flow_record_claim_audit(
    'artist_claim_invitation_cancelled',
    v_invitation,
    v_profile.id,
    jsonb_build_object('source', 'studio_owner_panel')
  );

  return public.studio_flow_owner_get_studio_memberships(v_studio_id);
end;
$$;

revoke all on function public.studio_flow_owner_assert_studio_access(uuid) from public;
revoke all on function public.studio_flow_owner_get_studio_memberships(uuid) from public;
revoke all on function public.studio_flow_owner_invite_artist(uuid, text, uuid) from public;
revoke all on function public.studio_flow_owner_cancel_artist_invitation(uuid) from public;

grant execute on function public.studio_flow_owner_get_studio_memberships(uuid) to authenticated;
grant execute on function public.studio_flow_owner_invite_artist(uuid, text, uuid) to authenticated;
grant execute on function public.studio_flow_owner_cancel_artist_invitation(uuid) to authenticated;
