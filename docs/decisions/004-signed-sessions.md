# ADR 004 — Signed session tokens

Date: 2026-11-14

Cloud library calls identify a user with an HMAC-SHA-256 token (`payload.mac`) whose payload is `{ uid, v: 1 }`. `readSession` rejects a bearer that is the raw `FUJARA_SESSION_SECRET`. The secret stays on the server. SQL row filters use `current_setting('fujara.user_id', true)`, so the database role sees a user id, not a shared password.

Rejected: one shared bearer password for every caller. That would not name a user for RLS.

`GET /api/backups` still compares the bearer to the secret through `authorizeCloudRequest`. Moving that route onto `readSession` is unfinished. No live database driver is connected in this build.
