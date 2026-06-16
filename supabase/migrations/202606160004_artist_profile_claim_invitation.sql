create or replace function public.studio_flow_artist_claim_invitation(
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_invitation artist_claim_invitations%rowtype;
  v_membership artist_studio_memberships%rowtype;
  v_membership_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  if p_claim_token is null then
    raise exception 'Claim invitation token is required';
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
  into v_artist
  from artists
  where profile_id = v_profile.id
    and status = 'active'
    and archived_at is null
  limit 1;

  if v_artist.id is null then
    raise exception 'Active artist required';
  end if;

  v_email := lower(v_profile.email);

  select *
  into v_invitation
  from artist_claim_invitations
  where token = p_claim_token
  for update;

  if v_invitation.id is null then
    raise exception 'Claim invitation is invalid';
  end if;

  if v_invitation.status <> 'pending'
    or v_invitation.expires_at <= now()
    or lower(v_invitation.invited_email) <> v_email
  then
    update artist_claim_invitations
    set
      status = case
        when v_invitation.expires_at <= now() then 'expired'
        when v_invitation.status = 'pending' then 'rejected'
        else v_invitation.status
      end
    where id = v_invitation.id
    returning *
    into v_invitation;

    insert into artist_claim_reviews (
      invitation_id,
      artist_id,
      studio_id,
      membership_id,
      requested_by_profile_id,
      status,
      reason
    )
    values (
      v_invitation.id,
      v_invitation.artist_id,
      v_invitation.studio_id,
      v_invitation.membership_id,
      v_profile.id,
      'open',
      'claim_token_invalid_or_email_mismatch'
    );

    perform studio_flow_record_claim_audit(
      'artist_claim_rejected',
      v_invitation,
      v_profile.id,
      jsonb_build_object('reason', 'invalid_status_expired_or_email_mismatch', 'source', 'artist_profile')
    );

    raise exception 'Claim invitation is invalid or expired';
  end if;

  if v_invitation.membership_id is not null then
    select *
    into v_membership
    from artist_studio_memberships
    where id = v_invitation.membership_id
    for update;

    if v_membership.id is null
      or v_membership.archived_at is not null
      or (
        v_invitation.studio_id is not null
        and v_membership.studio_id <> v_invitation.studio_id
      )
    then
      update artist_claim_invitations
      set status = 'rejected'
      where id = v_invitation.id
      returning *
      into v_invitation;

      insert into artist_claim_reviews (
        invitation_id,
        artist_id,
        studio_id,
        membership_id,
        requested_by_profile_id,
        status,
        reason
      )
      values (
        v_invitation.id,
        v_invitation.artist_id,
        v_invitation.studio_id,
        v_invitation.membership_id,
        v_profile.id,
        'open',
        'membership_artist_studio_mismatch'
      );

      perform studio_flow_record_claim_audit(
        'artist_claim_rejected',
        v_invitation,
        v_profile.id,
        jsonb_build_object('reason', 'membership_artist_studio_mismatch', 'source', 'artist_profile')
      );

      raise exception 'Claim invitation membership does not match artist and studio';
    end if;

    if exists (
      select 1
      from artist_studio_memberships existing_membership
      where existing_membership.artist_id = v_artist.id
        and existing_membership.studio_id = v_membership.studio_id
        and existing_membership.status = 'active'
        and existing_membership.id <> v_membership.id
    ) then
      raise exception 'Artist already has an active membership for this studio';
    end if;

    update artist_studio_memberships
    set
      artist_id = v_artist.id,
      status = 'active',
      ended_at = null,
      archived_at = null,
      updated_at = now()
    where id = v_membership.id
    returning id
    into v_membership_id;
  else
    if v_invitation.studio_id is null then
      raise exception 'Claim invitation does not include a studio membership';
    end if;

    if exists (
      select 1
      from artist_studio_memberships existing_membership
      where existing_membership.artist_id = v_artist.id
        and existing_membership.studio_id = v_invitation.studio_id
        and existing_membership.status = 'active'
    ) then
      raise exception 'Artist already has an active membership for this studio';
    end if;

    insert into artist_studio_memberships (
      artist_id,
      studio_id,
      role,
      status,
      started_at
    )
    values (
      v_artist.id,
      v_invitation.studio_id,
      'artist',
      'active',
      current_date
    )
    returning id
    into v_membership_id;
  end if;

  update artist_claim_invitations
  set
    status = 'accepted',
    artist_id = v_artist.id,
    membership_id = v_membership_id,
    accepted_by_profile_id = v_profile.id,
    accepted_at = now()
  where id = v_invitation.id
  returning *
  into v_invitation;

  perform studio_flow_record_claim_audit(
    'artist_claim_accepted',
    v_invitation,
    v_profile.id,
    jsonb_build_object('method', 'token', 'source', 'artist_profile')
  );

  return studio_flow_get_auth_context();
end;
$$;

revoke all on function public.studio_flow_artist_claim_invitation(uuid) from public;
grant execute on function public.studio_flow_artist_claim_invitation(uuid) to authenticated;
