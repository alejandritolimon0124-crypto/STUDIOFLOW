create or replace function public.studio_flow_sync_approved_marketplace_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_type public.marketplace_profile_type;
  v_title text;
  v_summary text;
  v_city text;
  v_approved boolean;
  v_profile public.marketplace_profiles%rowtype;
  v_listing_id uuid;
begin
  if tg_table_name = 'artists' then
    if old.status is not distinct from new.status then return new; end if;
    v_type := 'artist';
    v_approved := new.status = 'active' and new.archived_at is null;
    select coalesce(nullif(trim(ap.artistic_name), ''), nullif(trim(new.display_name), ''), 'Artista'),
      ap.bio, ap.city
    into v_title, v_summary, v_city
    from public.artist_profiles ap where ap.artist_id = new.id;
    v_title := coalesce(v_title, nullif(trim(new.display_name), ''), 'Artista');
  else
    if old.studio_status is not distinct from new.studio_status then return new; end if;
    v_type := 'studio';
    v_approved := new.studio_status = 'approved' and new.archived_at is null;
    select coalesce(nullif(trim(sp.commercial_name), ''), nullif(trim(new.name), ''), 'Estudio'),
      sp.description, sp.city
    into v_title, v_summary, v_city
    from public.studio_profiles sp where sp.studio_id = new.id;
    v_title := coalesce(v_title, nullif(trim(new.name), ''), 'Estudio');
  end if;

  select * into v_profile from public.marketplace_profiles
  where profile_type = v_type
    and ((v_type = 'artist' and artist_id = new.id) or (v_type = 'studio' and studio_id = new.id))
  for update;

  if not v_approved then
    if v_profile.id is not null then
      update public.marketplace_profiles
      set visibility_status = 'hidden', hidden_at = now(), updated_at = now()
      where id = v_profile.id and visibility_status <> 'suspended';
      update public.marketplace_listings
      set visibility_status = 'hidden', updated_at = now()
      where marketplace_profile_id = v_profile.id and visibility_status = 'visible';
    end if;
    return new;
  end if;

  if v_profile.id is null then
    insert into public.marketplace_profiles
      (profile_type, artist_id, studio_id, title, summary, visibility_status, published_at)
    values (v_type, case when v_type = 'artist' then new.id end,
      case when v_type = 'studio' then new.id end, v_title, v_summary, 'visible', now())
    returning * into v_profile;
  elsif v_profile.visibility_status = 'suspended' then
    return new;
  else
    update public.marketplace_profiles
    set title = v_title, summary = v_summary, visibility_status = 'visible',
      published_at = coalesce(published_at, now()), hidden_at = null, updated_at = now()
    where id = v_profile.id;
  end if;

  select id into v_listing_id from public.marketplace_listings
  where marketplace_profile_id = v_profile.id order by generated_at desc limit 1 for update;
  if v_listing_id is null then
    insert into public.marketplace_listings
      (marketplace_profile_id, artist_id, studio_id, city, visibility_status)
    values (v_profile.id, case when v_type = 'artist' then new.id end,
      case when v_type = 'studio' then new.id end, v_city, 'visible');
  else
    update public.marketplace_listings
    set visibility_status = 'hidden', updated_at = now()
    where marketplace_profile_id = v_profile.id and id <> v_listing_id and visibility_status = 'visible';
    update public.marketplace_listings
    set city = v_city, visibility_status = 'visible', expires_at = null, updated_at = now()
    where id = v_listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists studio_flow_sync_artist_marketplace_visibility on public.artists;
create trigger studio_flow_sync_artist_marketplace_visibility
after update of status on public.artists
for each row execute function public.studio_flow_sync_approved_marketplace_visibility();

drop trigger if exists studio_flow_sync_studio_marketplace_visibility on public.studios;
create trigger studio_flow_sync_studio_marketplace_visibility
after update of studio_status on public.studios
for each row execute function public.studio_flow_sync_approved_marketplace_visibility();

update public.marketplace_profiles mp
set visibility_status = 'hidden', hidden_at = now(), updated_at = now()
from public.artists a
where mp.profile_type = 'artist' and mp.artist_id = a.id
  and (a.status <> 'active' or a.archived_at is not null)
  and mp.visibility_status = 'visible';

update public.marketplace_profiles mp
set visibility_status = 'hidden', hidden_at = now(), updated_at = now()
from public.studios s
where mp.profile_type = 'studio' and mp.studio_id = s.id
  and (s.studio_status <> 'approved' or s.archived_at is not null)
  and mp.visibility_status = 'visible';

update public.marketplace_listings ml
set visibility_status = 'hidden', updated_at = now()
from public.marketplace_profiles mp
where ml.marketplace_profile_id = mp.id and ml.visibility_status = 'visible'
  and mp.visibility_status <> 'visible';
