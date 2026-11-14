# Architecture

Fujara is one Next.js app. Audio bytes stay on the device. Metadata can later sync to Postgres. Drive is a separate, optional backup of those bytes to the user's own account.

## Modules

| Module | Role |
| --- | --- |
| `src/domain` | File rules, labels, playlist order, ownership, sync policy, Drive upload contract, HTTP range parsing |
| `src/lib/browser-db.ts` | IndexedDB: entries, audio blobs, playlists, jobs, backup refs |
| `src/lib/fujara-context.tsx` | One React provider, one `<audio>` element, queue, Media Session when the browser has it |
| `src/app` | Library, playlists, downloads, settings |
| `public/sw.js` | Shell cache `fujara-shell-v1`. Skips `/api/` and OAuth callbacks. Does not delete IndexedDB |
| `src/app/api` | Cloud and Drive boundaries. They do not stream the user's library |

## Flows

**Import.** The file is classified. Bytes are hashed with SHA-256. A matching hash in the same local profile does not create a second copy and does not overwrite edited titles. The blob is written first. The library row is written only after that. Quota failures become a failed job and the track is not marked offline.

**Play.** The blob is read from IndexedDB and played through an object URL on the single audio element. The object URL is not the track id. Seeking uses the element clock. Safari does not need an HTTP 206 response for that object URL. `parseByteRange` exists so a future same-origin audio response can answer Range requests. User audio is not proxied through Vercel.

**Offline.** After one online visit, the service worker can serve the shell. Playback of imported tracks does not call auth, Drive, or a provider. iOS may still evict script storage for a site that is not installed; see `docs/iphone-offline.md`.

**Backup.** `uploadDriveFile` posts to the Drive multipart upload endpoint only when the caller supplies that user's access token. A backup is verified only when the response contains a file id. This environment has no OAuth client, so the settings screen stays "Not connected" and the callback route does not store tokens.

**Account separation.** Library rows are filtered by `profileId` in IndexedDB. Signing out drops the active id from `localStorage` and clears the on-screen list. It does not wipe another profile's rows. Cloud routes ignore the local profile and require `FUJARA_SESSION_SECRET`.

## Tradeoffs

- IndexedDB instead of OPFS. Blob playback is widely supported, including Safari. OPFS can be added behind the same store later.
- No Supabase SDK until a project exists. The SQL file is the schema. Unconfigured cloud features fail closed.
- Filename metadata only. ID3 parsing is not in this milestone, so unknown tags become "Unknown artist".
- Last-writer-wins playlist versions. No multi-user collaboration.
