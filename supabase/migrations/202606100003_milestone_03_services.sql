create type catalog_status as enum (
  'active',
  'retired'
);

create type service_tier_code as enum (
  'basic',
  'medium',
  'premium',
  'vip'
);

create type service_owner_type as enum (
  'artist',
  'studio',
  'membership'
);

create type service_status as enum (
  'draft',
  'active',
  'suspended',
  'archived'
);

create table service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status catalog_status not null default 'active',
  sort_order integer,
  created_at timestamptz not null default now(),
  constraint service_categories_slug_unique unique (slug),
  constraint service_categories_name_unique unique (name)
);

create index service_categories_status_idx on service_categories (status);
create index service_categories_sort_order_idx on service_categories (sort_order);

create table service_tiers (
  id uuid primary key default gen_random_uuid(),
  code service_tier_code not null,
  label text not null,
  default_points integer,
  status catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint service_tiers_code_unique unique (code),
  constraint service_tiers_default_points_check check (default_points is null or default_points >= 0)
);

create index service_tiers_code_idx on service_tiers (code);
create index service_tiers_status_idx on service_tiers (status);

create table service_offerings (
  id uuid primary key default gen_random_uuid(),
  owner_type service_owner_type not null,
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  category_id uuid not null references service_categories(id),
  tier_id uuid references service_tiers(id),
  name text not null,
  description text,
  price_amount numeric not null,
  duration_minutes integer not null,
  status service_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint service_offerings_owner_check check (
    (owner_type = 'artist' and artist_id is not null and studio_id is null and membership_id is null)
    or (owner_type = 'studio' and studio_id is not null and artist_id is null and membership_id is null)
    or (owner_type = 'membership' and membership_id is not null and artist_id is null and studio_id is null)
  ),
  constraint service_offerings_price_check check (price_amount >= 0),
  constraint service_offerings_duration_check check (duration_minutes > 0)
);

create unique index service_offerings_active_artist_name_unique
  on service_offerings (artist_id, name)
  where owner_type = 'artist' and status = 'active';

create unique index service_offerings_active_studio_name_unique
  on service_offerings (studio_id, name)
  where owner_type = 'studio' and status = 'active';

create unique index service_offerings_active_membership_name_unique
  on service_offerings (membership_id, name)
  where owner_type = 'membership' and status = 'active';

create index service_offerings_owner_artist_idx on service_offerings (owner_type, artist_id);
create index service_offerings_owner_studio_idx on service_offerings (owner_type, studio_id);
create index service_offerings_owner_membership_idx on service_offerings (owner_type, membership_id);
create index service_offerings_category_id_idx on service_offerings (category_id);
create index service_offerings_status_idx on service_offerings (status);

