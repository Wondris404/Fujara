# Roadmap

1. Finish Google OAuth (PKCE, state cookie, token storage on the server only) and a tested upload/restore against a personal Drive folder.
2. Add a real auth provider and apply the SQL migration with row policies and cross-user tests.
3. Run the iPhone script in `docs/iphone-offline.md` on hardware and write down what iOS actually did.
4. Optional: ID3/metadata editor that sets `userEdited` so a later duplicate import still keeps the person's title.
5. One verified metadata provider (for example MusicBrainz) that cannot be confused with audio download.
6. Range-capable local audio only if object URLs prove insufficient on a measured Safari bug.

Not in the next milestone: native store apps, recommendations, subscriptions, public sharing, transcoding, scrapers.
