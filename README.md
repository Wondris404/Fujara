# Fujara

Fujara is a personal music player that runs in the browser. The first working path is: import an audio file, store it in this device, and play it again later, including after a reload. Google Drive and a cloud catalogue are optional and are **not connected** unless you configure them.

This is not a Spotify replacement and it does not ship a licensed music catalogue.

## What works without accounts

- Import WAV, MP3, M4A, MP4 audio, OGG, WebM, FLAC, or AAC (up to 80 MB).
- Play, pause, seek, volume, next, and previous on one audio element.
- Library search over your own files only.
- Playlists with order stored locally.
- Separate actions for removing a local file, a library row, and a Drive reference.
- Installable manifest and a service worker that caches the app shell, not your audio and not API responses.

## Prerequisites

- Node.js 22 or newer
- npm

## Commands

```bash
cd C:\Users\ondre\Desktop\Fujara
npm install
npm run fixtures
npm run dev
```

Open http://localhost:3000 and import `public/fixtures/tone.wav`, or any audio file of your own.

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e
```

`test:e2e` starts production with `npx next start -p 4173` (`reuseExistingServer: false` in `playwright.config.ts`). It needs a prior `npm run build` and Playwright's Chromium (`npx playwright install chromium`). That e2e run was **not** executed in the helper-10 pass. It is not an iPhone test.

Unit tests exist (`npm test`). iPhone is **not verified**. Drive live upload is **not verified**. Ten helpers were requested.

## Local-only mode

If `.env.local` is missing, the app still imports and plays. Settings show Drive and the cloud library as **Not connected**. `/api/library` and `/api/backups` return 503 until `FUJARA_SESSION_SECRET` is set, and a wrong token returns 401. That local profile switch is not a production login.

## Docs

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Providers](docs/providers.md)
- [Google Drive setup](docs/google-drive-setup.md)
- [iPhone offline](docs/iphone-offline.md)
- [Deployment](docs/deployment.md)
- [Testing](docs/testing.md)
- [Roadmap](docs/roadmap.md)
- [Coordination](docs/coordination.md)
