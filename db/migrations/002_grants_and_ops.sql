-- Refresh tokens and idempotent sync ops. Audio bytes are not stored here.
-- Apply with the same role that 001 used, then set FUJARA_DB_APP_ROLE to a non-owner role so RLS is not bypassed.

create table if not exists sync_ops (
  id uuid primary key,
  owner_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  applied_at timestamptz not null default now()
);

create table if not exists drive_grants (
  owner_id uuid primary key references profiles (id) on delete cascade,
  refresh_token text not null,
  folder_id text,
  updated_at timestamptz not null default now()
);

alter table sync_ops enable row level security;
alter table drive_grants enable row level security;

drop policy if exists sync_ops_owner on sync_ops;
create policy sync_ops_owner on sync_ops
  using (owner_id::text = current_setting('fujara.user_id', true))
  with check (owner_id::text = current_setting('fujara.user_id', true));

drop policy if exists drive_grants_owner on drive_grants;
create policy drive_grants_owner on drive_grants
  using (owner_id::text = current_setting('fujara.user_id', true))
  with check (owner_id::text = current_setting('fujara.user_id', true));
