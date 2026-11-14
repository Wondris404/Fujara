-- Optional PostgreSQL metadata. Audio bytes do not belong in these tables.
-- Apply with your own database when cloud sync is configured.
-- Row filters are expressed as comments because this starter has no database role wiring yet.

create table if not exists profiles (
  id uuid primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists tracks (
  id uuid primary key,
  owner_id uuid not null references profiles (id),
  title text not null,
  artist text not null,
  duration_ms integer,
  mime text not null,
  content_hash text,
  source_provider text,
  source_page_url text,
  source_track_id text,
  user_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists playlists (
  id uuid primary key,
  owner_id uuid not null references profiles (id),
  name text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists playlist_items (
  id uuid primary key,
  playlist_id uuid not null references playlists (id) on delete cascade,
  track_id uuid not null references tracks (id) on delete cascade,
  position integer not null
);

create table if not exists backup_refs (
  id uuid primary key,
  owner_id uuid not null references profiles (id),
  track_id uuid not null references tracks (id) on delete cascade,
  provider text not null,
  file_id text not null,
  status text not null,
  checksum text,
  filename text not null,
  mime text not null,
  updated_at timestamptz not null default now()
);

-- Intended policy: a row is visible only when owner_id matches the authenticated profile.
-- Do not add a public audio URL column.
