-- Playlist item ids stay uuid. Uniqueness is the pair (playlist, track), not a text composite key.
-- sync_ops records a payload hash only after the mutation succeeds.

create unique index if not exists playlist_items_playlist_track
  on playlist_items (playlist_id, track_id);

alter table sync_ops add column if not exists payload_hash text;

create index if not exists tracks_owner_updated on tracks (owner_id, updated_at desc);
create index if not exists playlists_owner_updated on playlists (owner_id, updated_at desc);
create index if not exists backup_refs_owner_track on backup_refs (owner_id, track_id);
