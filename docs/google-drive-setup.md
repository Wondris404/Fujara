# Google Drive setup

Drive is optional. A person who never connects it can still import and play.

Fujara sign-in and Drive permission are different steps. This starter does not implement Fujara accounts yet. Drive OAuth is refused until credentials exist.

## Console steps

1. Open https://console.cloud.google.com/ and create a project you control.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen. While the app is in testing, only listed test users can grant access. `drive.file` is a non-sensitive scope per Google's Drive auth guide (reviewed 2026-09-03): https://developers.google.com/workspace/drive/api/guides/api-specific-auth
4. Create an OAuth client (Web). Add redirect URIs:
   - `http://localhost:3000/api/drive/callback`
   - your Vercel URL plus `/api/drive/callback` when you deploy
5. Put the client id and secret in server environment variables from `.env.example`. Never use `NEXT_PUBLIC_` for the secret. Never commit them.
6. Scope to request: `https://www.googleapis.com/auth/drive.file`
7. Use PKCE and a `state` value stored in an httpOnly cookie. Do not ask anyone to type a Google password into Fujara.

## What the code does today

`uploadDriveFile` in `src/domain/drive.ts` can POST a multipart body to `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` when a caller passes an access token and a `fetch` implementation. Tests cover failure without a file id and success with a mocked file id. No live Google call was made. `/api/drive/callback` returns 503 when the client id or secret is missing, and 501 if they are present, because state/PKCE storage is not finished. Do not treat a mock as a successful backup.

## Quotas

Drive storage counts against the Google account that grants access, not against a Fujara bucket. Check the current Google Drive storage policy in the account that will hold backups. Fujara does not pool users into one shared Drive.

## Restore

A recovery manifest downloaded from Settings lists metadata and any saved Drive file ids. Restoring bytes still needs an authorized `files.get?alt=media` for that id. That call is not wired to the player yet.
