alter table artist_profiles
  add column if not exists birthday date;

create or replace function public.studio_flow_validate_birth_date(
  p_birthday date
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_birthday is null then
    raise exception 'Birth date is required';
  end if;

  if p_birthday > current_date then
    raise exception 'Birth date cannot be in the future';
  end if;

  if p_birthday > (current_date - interval '18 years')::date then
    raise exception 'User must be at least 18 years old';
  end if;
end;
$$;

create index if not exists artist_profiles_birthday_idx
  on artist_profiles (birthday);

create or replace function public.studio_flow_bootstrap_client(
  p_display_name text,
  p_phone text default null,
  p_birthday date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
begin
  perform public.studio_flow_validate_birth_date(p_birthday);

  v_profile := studio_flow_bootstrap_profile(p_display_name, p_phone, 'client');

  select *
  into v_client
  from clients
  where profile_id = v_profile.id
  order by created_at
  limit 1;

  if v_client.id is null then
    select *
    into v_client
    from clients
    where lower(email) = lower(v_profile.email)
      and profile_id is null
    order by created_at
    limit 1;

    if v_client.id is null then
      insert into clients (profile_id, display_name, email, phone)
      values (v_profile.id, v_profile.display_name, v_profile.email, v_profile.phone)
      returning *
      into v_client;
    else
      update clients
      set
        profile_id = v_profile.id,
        display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
        phone = coalesce(v_profile.phone, phone),
        updated_at = now()
      where id = v_client.id
      returning *
      into v_client;
    end if;
  end if;

  insert into client_profiles (client_id, birthday)
  values (v_client.id, p_birthday)
  on conflict (client_id) do update
  set
    birthday = excluded.birthday,
    updated_at = now();

  return studio_flow_get_auth_context();
end;
$$;

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
      insert into artists (profile_id, display_name)
      values (
        v_profile.id,
        coalesce(nullif(trim(p_artistic_name), ''), nullif(trim(p_display_name), ''), v_profile.email)
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

create or replace function public.studio_flow_update_own_client_profile(
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_client_profile client_profiles%rowtype;
  v_birthday date;
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

  select *
  into v_client
  from clients
  where profile_id = v_profile.id
    and status <> 'archived'
  order by created_at
  limit 1;

  if v_client.id is null then
    raise exception 'Client profile required';
  end if;

  select *
  into v_client_profile
  from client_profiles
  where client_id = v_client.id;

  v_birthday := coalesce(
    nullif(trim(coalesce(p_patch ->> 'birthday', '')), '')::date,
    v_client_profile.birthday
  );

  perform public.studio_flow_validate_birth_date(v_birthday);

  update clients
  set
    display_name = coalesce(nullif(trim(p_patch ->> 'name'), ''), nullif(trim(p_patch ->> 'display_name'), ''), display_name),
    email = coalesce(nullif(trim(p_patch ->> 'email'), ''), email),
    phone = coalesce(nullif(trim(p_patch ->> 'phone'), ''), phone),
    updated_at = now()
  where id = v_client.id
  returning * into v_client;

  insert into client_profiles (
    client_id,
    birthday,
    photo_path
  )
  values (
    v_client.id,
    v_birthday,
    nullif(p_patch ->> 'photoUrl', '')
  )
  on conflict (client_id) do update
  set
    birthday = v_birthday,
    photo_path = case
      when p_patch ? 'photoUrl' then nullif(p_patch ->> 'photoUrl', '')
      when p_patch ? 'photo_path' then nullif(p_patch ->> 'photo_path', '')
      else client_profiles.photo_path
    end,
    updated_at = now()
  returning * into v_client_profile;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'clientProfile', to_jsonb(v_client_profile),
    'client_profile', to_jsonb(v_client_profile)
  );
end;
$$;

create or replace function public.studio_flow_artist_get_own_profile(
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_artist_profile artist_profiles%rowtype;
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

  select *
  into v_artist
  from artists
  where profile_id = v_profile.id
    and (p_artist_id is null or id = p_artist_id)
  order by created_at
  limit 1;

  if v_artist.id is null then
    raise exception 'Artist profile not found for current user';
  end if;

  if v_artist.status = 'archived' then
    raise exception 'Artist is archived';
  end if;

  select *
  into v_artist_profile
  from artist_profiles
  where artist_id = v_artist.id;

  return jsonb_build_object(
    'artist_profile',
    case
      when v_artist_profile.id is null then null
      else jsonb_build_object(
        'id', v_artist_profile.id,
        'artist_id', v_artist_profile.artist_id,
        'artistic_name', v_artist_profile.artistic_name,
        'birthday', v_artist_profile.birthday,
        'bio', v_artist_profile.bio,
        'specialties', coalesce(to_jsonb(v_artist_profile.specialties), '[]'::jsonb),
        'primary_specialty', v_artist_profile.primary_specialty,
        'years_experience', v_artist_profile.years_experience,
        'payment_methods', coalesce(v_artist_profile.payment_methods, '{}'::jsonb),
        'whatsapp', v_artist_profile.whatsapp,
        'instagram', v_artist_profile.instagram,
        'facebook', v_artist_profile.facebook,
        'tiktok', v_artist_profile.tiktok,
        'website', v_artist_profile.website,
        'photo_path', v_artist_profile.photo_path,
        'portfolio_paths', coalesce(to_jsonb(v_artist_profile.portfolio_paths), '[]'::jsonb),
        'use_studio_location', v_artist_profile.use_studio_location,
        'address_line', v_artist_profile.address_line,
        'city', v_artist_profile.city,
        'state', v_artist_profile.state,
        'postal_code', v_artist_profile.postal_code,
        'latitude', v_artist_profile.latitude,
        'longitude', v_artist_profile.longitude,
        'address_references', v_artist_profile.address_references,
        'google_maps_url', v_artist_profile.google_maps_url,
        'created_at', v_artist_profile.created_at,
        'updated_at', v_artist_profile.updated_at
      )
    end,
    'profile',
    jsonb_build_object(
      'id', v_profile.id,
      'phone', v_profile.phone,
      'updated_at', v_profile.updated_at
    ),
    'artist',
    jsonb_build_object(
      'id', v_artist.id,
      'display_name', v_artist.display_name,
      'status', v_artist.status
    )
  );
end;
$$;

create or replace function public.studio_flow_artist_save_own_profile(
  p_artist_id uuid,
  p_profile jsonb,
  p_update_phone boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_artist_profile artist_profiles%rowtype;
  v_phone text;
  v_birthday date;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active'
  for update;

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_artist
  from artists
  where id = p_artist_id
    and profile_id = v_profile.id
  for update;

  if v_artist.id is null then
    raise exception 'Artist profile not found for current user';
  end if;

  if v_artist.status = 'archived' then
    raise exception 'Artist is archived';
  end if;

  if nullif(trim(coalesce(p_profile ->> 'artistic_name', '')), '') is null then
    raise exception 'Artistic name is required';
  end if;

  v_birthday := nullif(trim(coalesce(p_profile ->> 'birthday', '')), '')::date;
  perform public.studio_flow_validate_birth_date(v_birthday);

  if p_update_phone then
    v_phone := nullif(trim(coalesce(p_profile ->> 'phone', '')), '');

    update profiles
    set
      phone = v_phone,
      updated_at = now()
    where id = v_profile.id
    returning *
    into v_profile;
  end if;

  insert into artist_profiles (
    artist_id,
    artistic_name,
    birthday,
    bio,
    specialties,
    primary_specialty,
    years_experience,
    payment_methods,
    whatsapp,
    instagram,
    facebook,
    tiktok,
    website,
    photo_path,
    portfolio_paths,
    use_studio_location,
    address_line,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    address_references,
    google_maps_url,
    updated_at
  )
  values (
    v_artist.id,
    nullif(trim(p_profile ->> 'artistic_name'), ''),
    v_birthday,
    nullif(trim(coalesce(p_profile ->> 'bio', '')), ''),
    array(select jsonb_array_elements_text(coalesce(p_profile -> 'specialties', '[]'::jsonb))),
    nullif(trim(coalesce(p_profile ->> 'primary_specialty', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'years_experience', '')), '')::integer,
    coalesce(p_profile -> 'payment_methods', '{}'::jsonb),
    nullif(trim(coalesce(p_profile ->> 'whatsapp', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'instagram', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'facebook', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'tiktok', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'website', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'photo_path', '')), ''),
    array(select jsonb_array_elements_text(coalesce(p_profile -> 'portfolio_paths', '[]'::jsonb))),
    coalesce((p_profile ->> 'use_studio_location')::boolean, true),
    nullif(trim(coalesce(p_profile ->> 'address_line', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'city', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'state', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'postal_code', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'latitude', '')), '')::numeric,
    nullif(trim(coalesce(p_profile ->> 'longitude', '')), '')::numeric,
    nullif(trim(coalesce(p_profile ->> 'address_references', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'google_maps_url', '')), ''),
    now()
  )
  on conflict (artist_id) do update
  set
    artistic_name = excluded.artistic_name,
    birthday = excluded.birthday,
    bio = excluded.bio,
    specialties = excluded.specialties,
    primary_specialty = excluded.primary_specialty,
    years_experience = excluded.years_experience,
    payment_methods = excluded.payment_methods,
    whatsapp = excluded.whatsapp,
    instagram = excluded.instagram,
    facebook = excluded.facebook,
    tiktok = excluded.tiktok,
    website = excluded.website,
    photo_path = excluded.photo_path,
    portfolio_paths = excluded.portfolio_paths,
    use_studio_location = excluded.use_studio_location,
    address_line = excluded.address_line,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    address_references = excluded.address_references,
    google_maps_url = excluded.google_maps_url,
    updated_at = now()
  returning *
  into v_artist_profile;

  update artists
  set
    display_name = v_artist_profile.artistic_name,
    updated_at = now()
  where id = v_artist.id
  returning *
  into v_artist;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    artist_id,
    event_type,
    after_data
  )
  values (
    v_profile.id,
    'identity',
    'artist_profile',
    v_artist_profile.id,
    v_artist.id,
    'artist_profile_saved',
    to_jsonb(v_artist_profile)
  );

  return jsonb_build_object(
    'artist_profile',
    jsonb_build_object(
      'id', v_artist_profile.id,
      'artist_id', v_artist_profile.artist_id,
      'artistic_name', v_artist_profile.artistic_name,
      'birthday', v_artist_profile.birthday,
      'bio', v_artist_profile.bio,
      'specialties', coalesce(to_jsonb(v_artist_profile.specialties), '[]'::jsonb),
      'primary_specialty', v_artist_profile.primary_specialty,
      'years_experience', v_artist_profile.years_experience,
      'payment_methods', coalesce(v_artist_profile.payment_methods, '{}'::jsonb),
      'whatsapp', v_artist_profile.whatsapp,
      'instagram', v_artist_profile.instagram,
      'facebook', v_artist_profile.facebook,
      'tiktok', v_artist_profile.tiktok,
      'website', v_artist_profile.website,
      'photo_path', v_artist_profile.photo_path,
      'portfolio_paths', coalesce(to_jsonb(v_artist_profile.portfolio_paths), '[]'::jsonb),
      'use_studio_location', v_artist_profile.use_studio_location,
      'address_line', v_artist_profile.address_line,
      'city', v_artist_profile.city,
      'state', v_artist_profile.state,
      'postal_code', v_artist_profile.postal_code,
      'latitude', v_artist_profile.latitude,
      'longitude', v_artist_profile.longitude,
      'address_references', v_artist_profile.address_references,
      'google_maps_url', v_artist_profile.google_maps_url,
      'created_at', v_artist_profile.created_at,
      'updated_at', v_artist_profile.updated_at
    ),
    'profile',
    jsonb_build_object(
      'id', v_profile.id,
      'phone', v_profile.phone,
      'updated_at', v_profile.updated_at
    ),
    'artist',
    jsonb_build_object(
      'id', v_artist.id,
      'display_name', v_artist.display_name,
      'status', v_artist.status
    )
  );
end;
$$;

revoke all on function public.studio_flow_validate_birth_date(date) from public;
revoke all on function public.studio_flow_bootstrap_client(text, text, date) from public;
revoke all on function public.studio_flow_bootstrap_artist(text, text, text, text, date, uuid) from public;

grant execute on function public.studio_flow_bootstrap_client(text, text, date) to authenticated;
grant execute on function public.studio_flow_bootstrap_artist(text, text, text, text, date, uuid) to authenticated;
