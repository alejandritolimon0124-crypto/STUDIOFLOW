begin;

-- Internal role assignment remains callable by trusted registration functions only.
revoke all on function public.studio_flow_assign_role(uuid, public.role_code, uuid) from public, anon, authenticated;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.studio_flow_bootstrap_profile(text,text,public.profile_default_role)'::regprocedure) into definition;
  if position('  select lower(email)' in definition) = 0 then
    raise exception 'Unexpected bootstrap definition';
  end if;
  definition := replace(definition, '  select lower(email)', $guard$
  if p_default_role is null or p_default_role not in ('client', 'artist') then
    raise exception 'Solo se permite registrar una cuenta de clienta o artista.' using errcode='42501';
  end if;
  if exists(select 1 from public.profiles where id=auth.uid() and status<>'active') then
    raise exception 'Active profile required' using errcode='42501';
  end if;
  select lower(email)$guard$);
  execute definition;
end $$;

create function public.studio_flow_security_is_owner()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from profiles p where p.id=auth.uid() and p.status='active'
    and (p.default_role='platform_owner' or exists(
      select 1 from user_role_assignments u join roles r on r.id=u.role_id
      where u.profile_id=p.id and u.status='active' and r.code='platform_owner')));
$$;

create function public.studio_flow_security_studio(p_studio uuid, p_edit boolean default false)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from profiles p join studios s on s.id=p_studio
    where p.id=auth.uid() and p.status='active' and s.archived_at is null
    and (s.owner_profile_id=p.id or exists(
      select 1 from user_role_assignments u join roles r on r.id=u.role_id
      where u.profile_id=p.id and u.studio_id=s.id and u.status='active'
        and (r.code='studio_owner' or (not p_edit and r.code='studio_manager')))));
$$;

create function public.studio_flow_security_artist(p_artist uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from artists a join profiles p on p.id=a.profile_id
    where a.id=p_artist and p.id=auth.uid() and p.status='active'
      and a.status='active' and a.archived_at is null);
$$;

create function public.studio_flow_security_appointment(p_client uuid, p_artist uuid, p_studio uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select studio_flow_security_is_owner() or studio_flow_security_artist(p_artist)
    or studio_flow_security_studio(p_studio)
    or exists(select 1 from clients c join profiles p on p.id=c.profile_id
      where c.id=p_client and p.id=auth.uid() and p.status='active' and c.status='active');
$$;

create function public.studio_flow_security_client(p_client uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select studio_flow_security_is_owner()
    or exists(select 1 from clients c join profiles p on p.id=c.profile_id
      where c.id=p_client and p.id=auth.uid() and p.status='active' and c.status='active')
    or exists(select 1 from appointments a where a.client_id=p_client
      and (studio_flow_security_artist(a.artist_id) or studio_flow_security_studio(a.studio_id)))
    or exists(select 1 from customer_relationships cr
      left join artist_studio_memberships m on m.id=cr.membership_id and m.status='active'
      where cr.client_id=p_client and cr.status='active' and (
        (cr.scope_type='artist' and studio_flow_security_artist(cr.artist_id))
        or (cr.scope_type='studio' and studio_flow_security_studio(cr.studio_id))
        or (cr.scope_type='membership' and
          (studio_flow_security_studio(m.studio_id) or studio_flow_security_artist(m.artist_id)))));
$$;

alter table public.appointments enable row level security;
alter table public.clients enable row level security;
alter table public.artists enable row level security;
alter table public.service_offerings enable row level security;
alter table public.studio_profiles enable row level security;

-- Restrictive policies also constrain any pre-existing permissive policy.
create policy sf_appointments_read on public.appointments for select to authenticated using (true);
create policy sf_appointments_scope on public.appointments as restrictive for select to authenticated
  using (studio_flow_security_appointment(client_id,artist_id,studio_id));
create policy sf_clients_read on public.clients for select to authenticated using (true);
create policy sf_clients_scope on public.clients as restrictive for select to authenticated
  using (studio_flow_security_client(id));

-- Membership data is not directly exposed: evaluate its relationship inside a definer.
create function public.studio_flow_security_artist_studio(p_artist uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from artist_studio_memberships m where m.artist_id=p_artist
    and m.status<>'archived' and studio_flow_security_studio(m.studio_id));
$$;
create policy sf_artists_read on public.artists for select to authenticated using (true);
create policy sf_artists_scope on public.artists as restrictive for select to authenticated using (
  studio_flow_security_is_owner() or studio_flow_security_artist(id)
  or studio_flow_security_artist_studio(id)
  or exists(select 1 from public.appointments a where a.artist_id=artists.id)
);

create policy sf_services_read on public.service_offerings for select to authenticated using (true);
create policy sf_services_scope on public.service_offerings as restrictive for select to authenticated using (
  studio_flow_security_is_owner() or studio_flow_security_artist(artist_id)
  or studio_flow_security_studio(studio_id)
  or exists(select 1 from public.appointments a where a.service_offering_id=service_offerings.id)
);

create policy sf_studio_profile_read on public.studio_profiles for select to authenticated using (true);
create policy sf_studio_profile_read_scope on public.studio_profiles as restrictive for select to authenticated
  using (studio_flow_security_is_owner() or studio_flow_security_studio(studio_id));
create policy sf_studio_profile_insert on public.studio_profiles for insert to authenticated with check (true);
create policy sf_studio_profile_insert_scope on public.studio_profiles as restrictive for insert to authenticated
  with check (studio_flow_security_is_owner() or studio_flow_security_studio(studio_id,true));
create policy sf_studio_profile_update on public.studio_profiles for update to authenticated using (true) with check (true);
create policy sf_studio_profile_update_scope on public.studio_profiles as restrictive for update to authenticated
  using (studio_flow_security_is_owner() or studio_flow_security_studio(studio_id,true))
  with check (studio_flow_security_is_owner() or studio_flow_security_studio(studio_id,true));
revoke delete, truncate, references, trigger on public.studio_profiles from authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'studio_flow_security_%' loop
    execute format('revoke all on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
commit;
