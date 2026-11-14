# Providers

Checked 2026-11-14. None of these are a working download catalogue inside Fujara.

| Source | Capability | Status |
| --- | --- | --- |
| Local files | Manual import and playback | Implemented |
| Mock catalogue | Fake metadata search | Code exists. Disabled unless `NEXT_PUBLIC_ENABLE_MOCK_SOURCE=true`. Results say Mock. |
| https://en1.mygomp3.com/ | Unknown | No official public API was verified. Not called. Not required. |
| MusicBrainz | Metadata search only | Candidate. It does not provide the recording audio. Not integrated. |
| Internet Archive | Some items allow download | Candidate only. Each item has its own rights. Not integrated. |
| YouTube, Spotify, Apple Music | Hosted playback under their own apps | Not a download API for Fujara. Not integrated. |

Search in the library page filters local rows. It never synthesizes a real discography.

If a future provider needs a server fetch, allow only https hosts on an explicit list, cap size and time, and refuse private IPs and redirects off the list. Do not put that proxy in until a provider contract exists.

External handoff, when a page URL is known: open it in a new tab, let the person download there, then use Import. Fujara cannot see another site's login or the OS download folder.
