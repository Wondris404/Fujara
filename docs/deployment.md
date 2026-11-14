# Deployment

Host the Next.js app on Vercel only as the web shell and the small API routes. Do not put the music library in function disk or in deployment storage.

## Vercel

1. Import the Git repository.
2. Framework preset: Next.js. Root is the app.
3. Set environment variables only on the server:
   - `FUJARA_SESSION_SECRET` if you intentionally enable the cloud guard
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` when Drive is ready
4. Do not set those as public env vars.
5. Confirm current limits before launch: https://vercel.com/docs/functions/limitations (reviewed 2026-11-14 against the 2026-08-24 page). Payload about 4.5 MB, Hobby max duration 300s, scratch `/tmp` not a database. Pricing changes. The free Hobby plan is not a promise that a commercial music product will fit.

Included function memory is not the same thing as per-user Drive quota or as browser storage.

## Database

Run `db/migrations/001_library.sql` on Postgres (Neon, Supabase, or another provider) when you add auth. Turn on row policies so `owner_id` is the session user. Until that ships, leave the API unconfigured. It will answer `not_connected`.

## After deploy

Play the local import path on a phone over HTTPS. Cloud buttons must still say they are not connected if secrets are absent.
