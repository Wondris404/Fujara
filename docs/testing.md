# Testing

## Automated in this workspace on 2026-11-14

Unit tests exist (`npm test` / `npx vitest run`, including `src/domain/domain.test.ts` and `src/domain/release.test.ts`). An earlier note in this file recorded 17 passing tests in `src/domain/domain.test.ts`, plus passing typecheck, lint, and build. Helper 10 did not re-run those commands, so that earlier summary is not a new result from this pass.

`npm run test:e2e` was **not** run. Playwright browsers were not installed in this pass (no long `playwright install`). No production server was started on port 4173 for this check, and no server was started on port 3456.

Ten helpers were requested for this Fujara pass. This file is helper 10 (test).

## Browser

`e2e/library.spec.ts` imports `public/fixtures/tone.wav`, expects the offline label, and navigates to Playlists. Playwright is configured for a production server: `npx next start -p 4173`, `baseURL` `http://127.0.0.1:4173`, `reuseExistingServer: false`. That command needs a prior `npm run build` and will not attach to a dev server. Run with `npm run test:e2e` after `npx playwright install chromium`. This pass did not do that install or that run.

## Not done

- iPhone is **not verified** (Home Screen, airplane mode, lock screen). Desktop Chromium would not count.
- Drive live upload is **not verified**. Live Google upload or restore was not run.
- A hosted database and cross-user SQL policies
- Playwright was not a substitute for iOS

## Manual desktop checks to repeat

1. Import the tone. Confirm Available offline.
2. Reload. The row remains.
3. Play, seek, open Playlists, confirm the bar is still the same player.
4. Remove local download. The library row remains and is not marked offline.
5. Create a second local profile. The first profile's tracks disappear from the list.
6. DevTools offline. Play the imported file without a network call to `/api`.
