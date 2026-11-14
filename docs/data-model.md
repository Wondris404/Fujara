# Data model

Global track identity is a UUID created at import, plus an optional content hash. It is not a `blob:` URL, a filesystem path, or a signed link.

## Device (IndexedDB `fujara`)

- `entries`: title, artist, mime, duration (filled by the player when known), content hash, source `{ provider, pageUrl?, providerTrackId? }`, `userEdited`, `profileId`.
- `audio`: blob, size, sha256, same id as the entry. Presence means "Available offline".
- `playlists` and `items`: ordered by `position`.
- `backups`: Drive file id and status. A row is not proof the file still exists.
- `jobs`: import/backup/restore state. Failed imports are not offline.
- `ops`: reserved for the versioned queue. The conflict helper lives in `src/domain/sync.ts`.

## Server (optional)

`db/migrations/001_library.sql` holds profiles, tracks, playlists, items, and backup refs. There is no audio byte column. Intended access rule: `owner_id` must match the authenticated user. The API currently refuses work when the session secret is unset, so this policy is not enforced by a live database yet.

## Sync

Offline edits stay in IndexedDB. When a server exists, playlist upserts carry an idempotency key and a version. A higher version wins. Equal versions use the later `updatedAt`. Duplicate keys are ignored. Documented in code as last-writer-wins.

## Deletion

- Remove local download: delete the audio row only.
- Remove from library: delete the entry, the audio, and playlist items. Backup refs are left unless you clear them.
- Delete Drive backup reference: deletes the local pointer. It does not call Drive in this build, because Drive is not authorized.

## Sign-out

The active profile id is removed. Rows for other profile ids stay in the database and are not rendered. A service worker must not cache `/api/*` responses, so one user's cloud payload is not reused for the next user.
