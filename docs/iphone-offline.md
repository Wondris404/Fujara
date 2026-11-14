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
- Ask for persistent storage from Downloads. Record whether iOS granted it. WebKit has historically applied a seven-day cap to script-writable storage for sites that are not used, with different treatment for Home Screen web apps. Re-read https://webkit.org/tracking-prevention/ before relying on it.
- Safari in a tab and the Home Screen app do not share storage. Import inside the icon you will use offline.
- If the browser clears storage, library rows that lose their blobs reconcile as not offline. Metadata without bytes shows **Needs download**.

## Playback limits

Autoplay can be blocked until a tap. Media Session handlers are registered when `navigator.mediaSession` exists. Lock-screen controls are best-effort. There is one audio element for the whole app, so in-app navigation does not create a second player.
