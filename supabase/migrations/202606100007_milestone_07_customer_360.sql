create type customer_scope_type as enum (
  'artist',
  'studio',
  'membership'
);

create type relationship_type as enum (
  'appointment',
  'favorite',
  'recurring',
  'imported'
);

create type relationship_status as enum (
  'active',
  'inactive',
  'archived'
);

create table client_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  birthday date,
  preferred_services text[],
  last_visit_at timestamptz,
  next_recommended_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_profiles_client_id_unique unique (client_id)
);

create index client_profiles_client_id_idx on client_profiles (client_id);
create index client_profiles_birthday_idx on client_profiles (birthday);

create table customer_private_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  scope_type customer_scope_type not null,
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  note text not null,
  created_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint customer_private_notes_scope_check check (
    (scope_type = 'artist' and artist_id is not null and studio_id is null and membership_id is null)
    or (scope_type = 'studio' and studio_id is not null and artist_id is null and membership_id is null)
    or (scope_type = 'membership' and membership_id is not null and artist_id is null and studio_id is null)
  )
);

create index customer_private_notes_client_id_idx on customer_private_notes (client_id);
create index customer_private_notes_scope_artist_idx on customer_private_notes (scope_type, artist_id);
create index customer_private_notes_scope_studio_idx on customer_private_notes (scope_type, studio_id);
create index customer_private_notes_scope_membership_idx on customer_private_notes (scope_type, membership_id);

create table customer_relationships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  scope_type customer_scope_type not null,
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  relationship_type relationship_type not null,
  status relationship_status not null default 'active',
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_relationships_scope_check check (
    (scope_type = 'artist' and artist_id is not null and studio_id is null and membership_id is null)
    or (scope_type = 'studio' and studio_id is not null and artist_id is null and membership_id is null)
    or (scope_type = 'membership' and membership_id is not null and artist_id is null and studio_id is null)
  )
);

create unique index customer_relationships_active_artist_unique
  on customer_relationships (client_id, artist_id, relationship_type)
  where scope_type = 'artist' and status = 'active';

create unique index customer_relationships_active_studio_unique
  on customer_relationships (client_id, studio_id, relationship_type)
  where scope_type = 'studio' and status = 'active';

create unique index customer_relationships_active_membership_unique
  on customer_relationships (client_id, membership_id, relationship_type)
  where scope_type = 'membership' and status = 'active';

create index customer_relationships_client_id_idx on customer_relationships (client_id);
create index customer_relationships_scope_artist_idx on customer_relationships (scope_type, artist_id);
create index customer_relationships_scope_studio_idx on customer_relationships (scope_type, studio_id);
create index customer_relationships_scope_membership_idx on customer_relationships (scope_type, membership_id);
create index customer_relationships_last_interaction_at_idx on customer_relationships (last_interaction_at);

create table favorite_artists (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  artist_id uuid not null references artists(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create unique index favorite_artists_active_unique
  on favorite_artists (client_id, artist_id)
  where removed_at is null;

create index favorite_artists_client_id_idx on favorite_artists (client_id);
create index favorite_artists_artist_id_idx on favorite_artists (artist_id);

