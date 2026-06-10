-- FASE 11.0 - Auth foundation.
-- No RLS policies are created or enabled in this migration.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_auth_users_fk'
      and conrelid = 'profiles'::regclass
  ) then
    alter table profiles
      add constraint profiles_id_auth_users_fk
      foreign key (id)
      references auth.users(id)
      on delete restrict
      not valid;
  end if;
end $$;

insert into roles (code, label, description)
values
  ('platform_owner', 'Platform owner', 'Acceso global de governance y operacion Studio Flow.'),
  ('studio_owner', 'Studio owner', 'Owner operativo de un estudio.'),
  ('studio_manager', 'Studio manager', 'Manager operativo scoped por estudio.'),
  ('artist', 'Artist', 'Artista profesional independiente o vinculada a estudios.'),
  ('client', 'Client', 'Cliente registrada de Studio Flow.')
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description;

create table if not exists artist_claim_invitations (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid(),
  artist_id uuid not null references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  invited_email text not null,
  status text not null default 'pending',
  invited_by_profile_id uuid references profiles(id),
  accepted_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint artist_claim_invitations_token_unique unique (token),
  constraint artist_claim_invitations_status_check check (
    status in ('pending', 'accepted', 'expired', 'revoked', 'rejected')
  )
);

create index if not exists artist_claim_invitations_artist_id_idx
  on artist_claim_invitations (artist_id);
create index if not exists artist_claim_invitations_email_status_idx
  on artist_claim_invitations (lower(invited_email), status);
create index if not exists artist_claim_invitations_membership_id_idx
  on artist_claim_invitations (membership_id);

create table if not exists artist_claim_reviews (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid references artist_claim_invitations(id),
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  requested_by_profile_id uuid references profiles(id),
  reviewed_by_profile_id uuid references profiles(id),
  status text not null default 'open',
  reason text,
  decision_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint artist_claim_reviews_status_check check (
    status in ('open', 'approved', 'rejected', 'cancelled')
  )
);

create index if not exists artist_claim_reviews_status_idx
  on artist_claim_reviews (status, created_at);
create index if not exists artist_claim_reviews_artist_id_idx
  on artist_claim_reviews (artist_id);
create index if not exists artist_claim_reviews_membership_id_idx
  on artist_claim_reviews (membership_id);

create or replace function public.studio_flow_get_auth_context()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_artist artists%rowtype;
  v_roles jsonb := '[]'::jsonb;
  v_memberships jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'profile', null,
      'roles', '[]'::jsonb,
      'client', null,
      'artist', null,
      'memberships', '[]'::jsonb
    );
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid();

  if v_profile.id is null then
    return jsonb_build_object(
      'profile', null,
      'roles', '[]'::jsonb,
      'client', null,
      'artist', null,
      'memberships', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ura.id,
        'role', r.code,
        'studioId', ura.studio_id,
        'status', ura.status
      )
      order by ura.created_at
    ),
    '[]'::jsonb
  )
  into v_roles
  from user_role_assignments ura
  join roles r on r.id = ura.role_id
  where ura.profile_id = v_profile.id
    and ura.status = 'active';

  select *
  into v_client
  from clients
  where profile_id = v_profile.id
  order by created_at
  limit 1;

  select *
  into v_artist
  from artists
  where profile_id = v_profile.id
  order by created_at
  limit 1;

  if v_artist.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', asm.id,
          'artistId', asm.artist_id,
          'studioId', asm.studio_id,
          'role', asm.role,
          'status', asm.status
        )
        order by asm.created_at
      ),
      '[]'::jsonb
    )
    into v_memberships
    from artist_studio_memberships asm
    where asm.artist_id = v_artist.id
      and asm.status = 'active';
  end if;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'roles', v_roles,
    'client', case when v_client.id is null then null else to_jsonb(v_client) end,
    'artist', case when v_artist.id is null then null else to_jsonb(v_artist) end,
    'memberships', v_memberships
  );
end;
$$;

create or replace function public.studio_flow_assign_role(
  p_profile_id uuid,
  p_role role_code,
  p_studio_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select id
  into v_role_id
  from roles
  where code = p_role;

  if v_role_id is null then
    raise exception 'Role % does not exist', p_role;
  end if;

  if not exists (
    select 1
    from user_role_assignments
    where profile_id = p_profile_id
      and role_id = v_role_id
      and status = 'active'
      and (
        (p_studio_id is null and studio_id is null)
        or studio_id = p_studio_id
      )
  ) then
    insert into user_role_assignments (profile_id, role_id, studio_id)
    values (p_profile_id, v_role_id, p_studio_id);
  end if;
end;
$$;

create or replace function public.studio_flow_bootstrap_profile(
  p_display_name text,
  p_phone text,
  p_default_role profile_default_role
)
returns profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select lower(email)
  into v_email
  from auth.users
  where id = auth.uid();

  insert into profiles (id, display_name, email, phone, default_role)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_display_name), ''), v_email),
    v_email,
    nullif(trim(coalesce(p_phone, '')), ''),
    p_default_role
  )
  on conflict (id) do update
  set
    display_name = coalesce(nullif(trim(p_display_name), ''), profiles.display_name),
    email = excluded.email,
    phone = coalesce(excluded.phone, profiles.phone),
    default_role = coalesce(profiles.default_role, excluded.default_role),
    updated_at = now()
  returning *
  into v_profile;

  perform studio_flow_assign_role(auth.uid(), p_default_role::text::role_code, null);

  return v_profile;
end;
$$;

create or replace function public.studio_flow_bootstrap_client(
  p_display_name text,
  p_phone text default null
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

  insert into client_profiles (client_id)
  values (v_client.id)
  on conflict (client_id) do nothing;

  return studio_flow_get_auth_context();
end;
$$;

create or replace function public.studio_flow_record_claim_audit(
  p_event_type text,
  p_invitation artist_claim_invitations,
  p_actor_profile_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.audit_events') is null or p_invitation.id is null then
    return;
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    artist_id,
    membership_id,
    event_type,
    metadata
  )
  values (
    p_actor_profile_id,
    'identity',
    'artist_claim_invitation',
    p_invitation.id,
    p_invitation.studio_id,
    p_invitation.artist_id,
    p_invitation.membership_id,
    p_event_type,
    p_metadata
  );
end;
$$;

create or replace function public.studio_flow_bootstrap_artist(
  p_display_name text,
  p_phone text default null,
  p_artistic_name text default null,
  p_city text default null,
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

  insert into artist_profiles (artist_id, artistic_name, city)
  values (
    v_artist.id,
    coalesce(nullif(trim(p_artistic_name), ''), v_artist.display_name),
    nullif(trim(coalesce(p_city, '')), '')
  )
  on conflict (artist_id) do update
  set
    artistic_name = coalesce(nullif(trim(p_artistic_name), ''), artist_profiles.artistic_name),
    city = coalesce(excluded.city, artist_profiles.city),
    updated_at = now();

  return studio_flow_get_auth_context();
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_default_role profile_default_role;
begin
  v_default_role := coalesce(
    nullif(new.raw_user_meta_data ->> 'default_role', '')::profile_default_role,
    'client'::profile_default_role
  );

  insert into profiles (id, display_name, email, phone, default_role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new.email),
    lower(new.email),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_default_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_studio_flow on auth.users;

create trigger on_auth_user_created_studio_flow
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

grant execute on function public.studio_flow_get_auth_context() to anon, authenticated;
grant execute on function public.studio_flow_bootstrap_client(text, text) to authenticated;
grant execute on function public.studio_flow_bootstrap_artist(text, text, text, text, uuid) to authenticated;
