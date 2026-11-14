"use client";

import { useState } from "react";
import { playlistTracks, useFujara } from "@/lib/fujara-context";

export default function PlaylistsPage() {
  const app = useFujara();
  const [name, setName] = useState("");
  return (
    <section className="space-y-4">
      <h2 className="text-2xl">Playlists</h2>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void app.createPlaylist(name);
          setName("");
        }}
      >
        <input
          aria-label="Playlist name"
          className="rounded-full border bg-transparent px-4 py-2"
          style={{ borderColor: "var(--line)" }}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New playlist"
        />
        <button className="rounded-full bg-[var(--gold)] px-4 py-2 text-[#1b120c]" type="submit" aria-label="Create playlist">
          Create
        </button>
      </form>
      {app.playlists.length === 0 ? <p className="text-sm text-[var(--muted)]">No playlists yet.</p> : null}
      {app.playlists.map((playlist) => {
        const rows = playlistTracks(app.items, playlist.id);
        return (
          <article key={playlist.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
            <h3 className="text-xl">{playlist.name}</h3>
            <p className="text-xs text-[var(--muted)]">Version {playlist.version}. Order is stored on this device.</p>
            {rows.length === 0 ? <p className="mt-2 text-sm">This playlist is empty. Add tracks from the library.</p> : null}
            <ol className="mt-3 space-y-2">
              {rows.map((item, index) => {
                const entry = app.entries.find((row) => row.id === item.trackId);
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {index + 1}. {entry?.title ?? "Missing track"} — {entry?.artist ?? ""}
                    </span>
                    <span className="flex gap-2">
                      <button type="button" aria-label={`Move ${entry?.title ?? "track"} up in ${playlist.name}`} onClick={() => void app.moveInPlaylist(playlist.id, item.trackId, -1)}>
                        Up
                      </button>
                      <button type="button" aria-label={`Move ${entry?.title ?? "track"} down in ${playlist.name}`} onClick={() => void app.moveInPlaylist(playlist.id, item.trackId, 1)}>
                        Down
                      </button>
                      <button type="button" aria-label={`Play ${entry?.title ?? "track"} from ${playlist.name}`} onClick={() => entry && app.playTrack(entry.id, rows.map((row) => row.trackId))}>
                        Play
                      </button>
                      <button type="button" aria-label={`Remove ${entry?.title ?? "track"} from ${playlist.name}`} onClick={() => void app.removeFromPlaylist(playlist.id, item.trackId)}>
                        Remove
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}
    </section>
  );
}
