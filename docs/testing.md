# Testing

## Automated in this workspace on 2026-11-14

- `npm test` — 17 tests passed in `src/domain/domain.test.ts`.
- `npm run typecheck` — passed.
- `npm run lint` — passed with no errors after removing an unused import. Next.js printed a deprecation notice for `next lint`.
- `npm run build` — passed (Next.js 15.5.29).

`npm run test:e2e` was not run. Playwright browsers were not installed. No iPhone was used.

## Browser

`e2e/library.spec.ts` imports `public/fixtures/tone.wav`, expects the offline label, and navigates to Playlists. Run with `npm run test:e2e` after `npx playwright install chromium`.

## Not done

- Real iPhone Home Screen, airplane mode, and lock screen
- Live Google upload or restore
- A hosted database and cross-user SQL policies
- Playwright was not a substitute for iOS

## Manual desktop checks to repeat

1. Import the tone. Confirm Available offline.
2. Reload. The row remains.
3. Play, seek, open Playlists, confirm the bar is still the same player.
4. Remove local download. The library row remains and is not marked offline.
5. Create a second local profile. The first profile's tracks disappear from the list.
6. DevTools offline. Play the imported file without a network call to `/api`.
