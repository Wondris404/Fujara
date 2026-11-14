# Architecture

Fujara is one Next.js app. Audio bytes stay on the device in IndexedDB. Postgres metadata and Google Drive are optional and fail closed when they are not configured. This document describes the tree as it is. It does not claim that iPhone offline playback or a live Drive account was verified, and it contains no credentials.

## Modules

| Module | Role |
| --- | --- |
| `src/domain` | File rules, labels, playlist order, ownership, sync policy, Drive upload contract, HTTP range parsing, load gate, source parsers |
| `src/lib/browser-db.ts` | IndexedDB database `fujara` (version 2): `entries`, `audio` blobs, `playlists`, `items`, `backups`, `jobs`, `ops` |
| `src/lib/fujara-context.tsx` | One React provider, one hidden `<audio>` element, queue in `sessionStorage`, Media Session when the browser has it |
| `src/domain/player-machine.ts` | `createLoadGate` drops a stale load when a newer track starts. `shouldReloadAudio` replaces `src` only for a track change |
| `src/server/session.ts` | HMAC-SHA-256 session tokens. A token equal to `FUJARA_SESSION_SECRET` is rejected |
| `src/app` | Library, playlists, downloads, settings |
| `public/sw.js` | Shell cache `fujara-shell-v2`. Skips non-GET, `/api/`, and paths that contain `callback`. Does not delete IndexedDB. Precache list is `public/shell-assets.json`, written after `next build`. |
| `src/app/api` | Cloud, catalogue search, and Drive OAuth. These routes do not stream the user's library |

## Flows

**Import.** The file is classified (accepted extensions, max 80 MB). Bytes are hashed with SHA-256. A matching hash in the same local profile does not create a second copy and does not overwrite edited titles. The blob is written first. The library row is written only after that. Quota failures become a failed job and the track is not marked offline.

**Play.** The blob is read from IndexedDB and played through one object URL on the single `<audio>` element (`preload="metadata"`). The object URL is not the track id. Seeking uses the element clock. A load gate ticket is taken before the IndexedDB read and checked again before `src` is set and before a play error is shown, so an older load cannot replace a newer one. Volume changes do not reload the source. Safari does not need an HTTP 206 response for that object URL. `parseByteRange` exists so a future same-origin audio response can answer Range requests. User audio is not proxied through Vercel.

**Offline.** After one online visit, the service worker can serve the shell and `/_next/static/` assets it cached. Playback of imported tracks does not call auth, Drive, or a provider. iOS may still evict script storage for a site that is not installed; see `docs/iphone-offline.md`. That note is a risk, not a verified device result.

**Catalogue.** `GET /api/sources/search` queries MusicBrainz recordings (metadata only: title, artist, recording page) and Internet Archive (`mediatype:audio`, fields identifier, title, creator, `licenseurl`). An Archive download URL is attached only when `licenseurl` is present. MusicBrainz hits have no `audioUrl`. A source outage adds no rows. The library page treats a metadata hit as not a download.

**Backup and Drive.** `uploadDriveFile` posts to the Drive multipart upload endpoint only when the caller supplies that user's access token. A backup is verified only when the response contains a file id. `GET /api/drive/start` builds an OAuth authorization URL with PKCE (`S256`) and stores `state` plus the code verifier in httpOnly cookies for 10 minutes. `GET /api/drive/callback` checks state, exchanges the code with `code_verifier`, and, if Google returns one, sets an httpOnly `fujara_drive_refresh` cookie scoped to `/api/drive`. Missing Google env vars return 503 and store nothing. This tree does not show a completed Drive login.

**Cloud identity.** `issueSession` / `readSession` mint and check `payload.mac` tokens (HMAC-SHA-256, payload `{ uid, v: 1 }`). `GET` and `POST /api/library` require `FUJARA_SESSION_SECRET` and `DATABASE_URL`, then `Authorization: Bearer` that token. A bearer equal to the secret is unauthorized. Even with both env vars set, this build has no live Postgres driver: GET returns an empty entry list and POST returns 501. SQL in `db/migrations/001_library.sql` enables row level security on tracks, playlists, playlist items, and backup refs. Policies compare `owner_id` (or the parent playlist owner) to `current_setting('fujara.user_id', true)`. `GET /api/backups` still uses `authorizeCloudRequest`, which accepts the bearer only when it equals `FUJARA_SESSION_SECRET`. That route is not on the signed-token path.

**Account separation.** Library rows are filtered by `profileId` in IndexedDB. Signing out drops the active id from `localStorage` and clears the on-screen list. It does not wipe another profile's rows. Cloud routes ignore the local profile.

## Tradeoffs

- IndexedDB instead of OPFS. Blob playback is widely supported, including Safari. OPFS can be added behind the same store later.
- No Supabase SDK until a project exists. The SQL file is the schema. Unconfigured cloud features fail closed.
- Filename metadata for local imports. ID3 parsing is not in this milestone, so unknown tags become "Unknown artist". Catalogue titles come from MusicBrainz or Archive, not from invented rows.
- Last-writer-wins playlist versions. No multi-user collaboration.
- Signed session tokens for the library route. The backups route still compares the bearer to the session secret. See ADR 004.
