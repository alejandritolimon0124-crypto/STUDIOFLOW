alter table public.artists
  alter column status set default 'pending';

create or replace function public.studio_flow_bootstrap_artist(
  p_display_name text,
  p_phone text default null,
  p_artistic_name text default null,
  p_city text default null,
  p_birthday date default null,
  p_claim_token uuid default null
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
  v_email text;
  v_pending_invitation_count integer := 0;
  v_membership_is_valid boolean := true;
begin
  perform public.studio_flow_validate_birth_date(p_birthday);

  v_profile := studio_flow_bootstrap_profile(p_display_name, p_phone, 'artist');
  v_email := lower(v_profile.email);

  if p_claim_token is not null then
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
        jsonb_build_object('reason', 'invalid_status_expired_or_email_mismatch')
      );

      raise exception 'Claim invitation is invalid or expired';
    end if;

    if v_invitation.membership_id is not null then
      select exists (
        select 1
        from artist_studio_memberships asm
        where asm.id = v_invitation.membership_id
          and asm.artist_id = v_invitation.artist_id
          and (
            v_invitation.studio_id is null
            or asm.studio_id = v_invitation.studio_id
          )
      )
      into v_membership_is_valid;

      if not v_membership_is_valid then
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
          jsonb_build_object('reason', 'membership_artist_studio_mismatch')
        );

        raise exception 'Claim invitation membership does not match artist and studio';
      end if;
    end if;

    select *
    into v_artist
    from artists
    where id = v_invitation.artist_id
    for update;

    if v_artist.profile_id is not null and v_artist.profile_id <> v_profile.id then
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
        'artist_already_claimed'
      );

      perform studio_flow_record_claim_audit(
        'artist_claim_rejected',
        v_invitation,
        v_profile.id,
        jsonb_build_object('reason', 'artist_already_claimed')
      );

      raise exception 'Artist is already claimed';
    end if;

    update artists
    set
      profile_id = v_profile.id,
      updated_at = now()
    where id = v_artist.id
    returning *
    into v_artist;

    update artist_claim_invitations
    set
      status = 'accepted',
      accepted_by_profile_id = v_profile.id,
      accepted_at = now()
    where id = v_invitation.id;

    perform studio_flow_record_claim_audit(
      'artist_claim_accepted',
      v_invitation,
      v_profile.id,
      jsonb_build_object('method', 'token')
    );
  else
    select count(*)
    into v_pending_invitation_count
    from artist_claim_invitations
    where lower(invited_email) = v_email
      and status = 'pending'
      and expires_at > now();

    if v_pending_invitation_count > 0 then
      insert into artist_claim_reviews (
        requested_by_profile_id,
        status,
        reason
      )
      values (
        v_profile.id,
        'open',
        'pending_invitation_without_token'
      );

      raise exception 'A pending artist claim invitation exists for this email. Use the invitation token or request review.';
    end if;

    select *
    into v_artist
    from artists
    where profile_id = v_profile.id
    order by created_at
    limit 1;

    if v_artist.id is null then
      insert into artists (profile_id, display_name, status)
      values (
        v_profile.id,
        coalesce(nullif(trim(p_artistic_name), ''), nullif(trim(p_display_name), ''), v_profile.email),
        'pending'
      )
      returning *
      into v_artist;
    end if;
  end if;

  insert into artist_profiles (artist_id, artistic_name, city, birthday)
  values (
    v_artist.id,
    coalesce(nullif(trim(p_artistic_name), ''), v_artist.display_name),
    nullif(trim(coalesce(p_city, '')), ''),
    p_birthday
  )
  on conflict (artist_id) do update
  set
    artistic_name = coalesce(nullif(trim(p_artistic_name), ''), artist_profiles.artistic_name),
    city = coalesce(excluded.city, artist_profiles.city),
    birthday = excluded.birthday,
    updated_at = now();

  return studio_flow_get_auth_context();
end;
$$;

update public.artists artist
set status = 'pending', updated_at = now()
where artist.status = 'active'
  and artist.created_at >= now() - interval '7 days'
  and not exists (
    select 1
    from public.service_offerings service
    where service.artist_id = artist.id
      and service.status <> 'archived'
  )
  and not exists (
    select 1
    from public.marketplace_profiles profile
    where profile.artist_id = artist.id
  )
  and not exists (
    select 1
    from public.marketplace_listings listing
    where listing.artist_id = artist.id
  );

revoke all on function public.studio_flow_bootstrap_artist(text, text, text, text, date, uuid) from public;
grant execute on function public.studio_flow_bootstrap_artist(text, text, text, text, date, uuid) to authenticated;
