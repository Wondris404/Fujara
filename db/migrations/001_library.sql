-- Optional PostgreSQL metadata for Fujara. One database, no second store.
-- Audio bytes stay on the device (IndexedDB / OPFS) and in optional per-user Drive backups.
-- Do not add bytea, blob, or file-content columns here.
-- The API sets the session user with SET LOCAL fujara.user_id before queries.
-- Policies are real row level security and are safe to re-apply.

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
  favorite boolean not null default false,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists playlists (
  id uuid primary key,
  owner_id uuid not null references profiles (id),
  name text not null,
  version integer not null default 1,
  deleted_at timestamptz,
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

alter table tracks add column if not exists favorite boolean not null default false;
alter table tracks add column if not exists version integer not null default 1;
alter table tracks add column if not exists deleted_at timestamptz;
alter table playlists add column if not exists version integer not null default 1;
alter table playlists add column if not exists deleted_at timestamptz;

alter table profiles enable row level security;
alter table tracks enable row level security;
alter table playlists enable row level security;
alter table playlist_items enable row level security;
alter table backup_refs enable row level security;

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  using (id::text = current_setting('fujara.user_id', true))
  with check (id::text = current_setting('fujara.user_id', true));

drop policy if exists tracks_owner on tracks;
create policy tracks_owner on tracks
  using (owner_id::text = current_setting('fujara.user_id', true))
  with check (owner_id::text = current_setting('fujara.user_id', true));

drop policy if exists playlists_owner on playlists;
create policy playlists_owner on playlists
  using (owner_id::text = current_setting('fujara.user_id', true))
  with check (owner_id::text = current_setting('fujara.user_id', true));

drop policy if exists items_owner on playlist_items;
create policy items_owner on playlist_items
  using (
    exists (
      select 1 from playlists
      where playlists.id = playlist_items.playlist_id
        and playlists.owner_id::text = current_setting('fujara.user_id', true)
    )
  )
  with check (
    exists (
      select 1 from playlists
      where playlists.id = playlist_items.playlist_id
        and playlists.owner_id::text = current_setting('fujara.user_id', true)
    )
  );

drop policy if exists backups_owner on backup_refs;
create policy backups_owner on backup_refs
  using (owner_id::text = current_setting('fujara.user_id', true))
  with check (owner_id::text = current_setting('fujara.user_id', true));
