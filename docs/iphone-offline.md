# iPhone offline test

iPhone is **not verified**. These steps were **not run on a real iPhone**. Desktop Chromium does not prove Home Screen behavior. Drive live upload is a separate check and is also **not verified**.

## Install

1. Deploy or open the dev machine over HTTPS. iOS will not install a typical `http://` LAN origin as a full standalone app the way it does a secure origin. `localhost` on the phone itself is not this desktop.
2. In Safari, open the site, share, Add to Home Screen.
3. Open Fujara from the icon, not from a tab you immediately dismiss.

## Download and airplane mode

1. Import `tone.wav` or another accepted file.
2. Wait until Downloads shows **Available offline** and a non-zero used size.
3. Leave the installed app (swipe it away).
4. Open it again and confirm the track is still listed.
5. Turn on airplane mode.
6. Play, seek, and use next/previous if you imported more than one file.
7. Lock and unlock the phone. Note whether audio continues. iOS may suspend a Home Screen web app. A service worker will not keep downloading a library after suspension. Background download of a whole catalogue is out of scope.

## Updates and storage

- The shell cache name is `fujara-shell-v2`. Activating a new cache deletes older shell caches only. It does not delete IndexedDB.

## How to open Fujara

This project is a website and an installable PWA. It does not build an APK or an IPA.

- PC: `npm run dev` and open `http://localhost:3000`. Localhost is a secure context, so the service worker can register.
- Phone or another computer on the network: use HTTPS. Plain `http://192.168.x.x` is not a secure context, so a service worker and some storage APIs will not behave as they do on localhost. Use a host such as Vercel preview or another HTTPS tunnel, then open that `https://` URL.
- iPhone: Safari → Share → Add to Home Screen → open the icon. This has not been run on a physical iPhone in this repository.
- Android: Chrome or another supported browser → Install app or Add to Home screen.
- Desktop Chromium: the install icon in the address bar, after the production site is served over HTTPS or localhost.

Icons: `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` (180). SVG remains as a scalable icon.
- Ask for persistent storage from Downloads. Record whether iOS granted it. WebKit has historically applied a seven-day cap to script-writable storage for sites that are not used, with different treatment for Home Screen web apps. Re-read https://webkit.org/tracking-prevention/ before relying on it.
- Safari in a tab and the Home Screen app do not share storage. Import inside the icon you will use offline.
- If the browser clears storage, library rows that lose their blobs reconcile as not offline. Metadata without bytes shows **Needs download**.

## Playback limits

Autoplay can be blocked until a tap. Media Session handlers are registered when `navigator.mediaSession` exists. Lock-screen controls are best-effort. There is one audio element for the whole app, so in-app navigation does not create a second player.
