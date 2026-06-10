create type marketplace_profile_type as enum (
  'artist',
  'studio',
  'membership'
);

create type marketplace_visibility_status as enum (
  'draft',
  'visible',
  'hidden',
  'suspended'
);

create type marketplace_listing_status as enum (
  'visible',
  'hidden',
  'expired'
);

create table marketplace_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_type marketplace_profile_type not null,
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  title text not null,
  summary text,
  visibility_status marketplace_visibility_status not null default 'draft',
  published_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_profiles_target_check check (
    (profile_type = 'artist' and artist_id is not null and studio_id is null and membership_id is null)
    or (profile_type = 'studio' and studio_id is not null and artist_id is null and membership_id is null)
    or (profile_type = 'membership' and membership_id is not null and artist_id is null and studio_id is null)
  )
);

create unique index marketplace_profiles_artist_unique
  on marketplace_profiles (artist_id)
  where profile_type = 'artist';

create unique index marketplace_profiles_studio_unique
  on marketplace_profiles (studio_id)
  where profile_type = 'studio';

create unique index marketplace_profiles_membership_unique
  on marketplace_profiles (membership_id)
  where profile_type = 'membership';

create index marketplace_profiles_visibility_status_idx on marketplace_profiles (visibility_status);
create index marketplace_profiles_type_artist_idx on marketplace_profiles (profile_type, artist_id);
create index marketplace_profiles_type_studio_idx on marketplace_profiles (profile_type, studio_id);
create index marketplace_profiles_type_membership_idx on marketplace_profiles (profile_type, membership_id);

create table marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  marketplace_profile_id uuid not null references marketplace_profiles(id),
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  city text,
  visibility_status marketplace_listing_status not null default 'visible',
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketplace_listings_visibility_city_idx on marketplace_listings (visibility_status, city);
create index marketplace_listings_profile_id_idx on marketplace_listings (marketplace_profile_id);
create index marketplace_listings_artist_id_idx on marketplace_listings (artist_id);
create index marketplace_listings_studio_id_idx on marketplace_listings (studio_id);
create index marketplace_listings_membership_id_idx on marketplace_listings (membership_id);

alter table appointments
  add constraint appointments_marketplace_listing_id_fkey
  foreign key (marketplace_listing_id) references marketplace_listings(id);

