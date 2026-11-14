"use client";

import { useState } from "react";
import { useFujara } from "@/lib/fujara-context";

export default function LibraryPage() {
  const app = useFujara();
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const filtered = app.entries.filter((entry) => {
    const q = app.query.trim().toLowerCase();
    if (!q) return true;
    return `${entry.title} ${entry.artist}`.toLowerCase().includes(q);
  });

  async function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    setMessage("Saving on this device…");
    setMessage(await app.importFiles(files));
  }

  return (
    <section className="space-y-5">
      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: dragOver ? "var(--gold)" : "var(--line)", background: "var(--panel)" }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void take(event.dataTransfer.files);
        }}
      >
        <h2 className="text-2xl">Library</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Local search looks only at music already in this profile. It does not invent songs from the internet.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm text-[#1b120c]">
            Import audio
            <input
              className="sr-only"
              aria-label="Import audio"
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac"
              multiple
              onChange={(event) => {
                void take(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <input
            aria-label="Search library"
            className="min-w-56 flex-1 rounded-full border bg-transparent px-4 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
            placeholder="Search your library"
            value={app.query}
            onChange={(event) => app.setQuery(event.target.value)}
          />
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">On desktop you can also drop audio files here.</p>
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">External catalogue</h3>
        <p className="text-sm text-[var(--muted)]">
          No music provider is connected. A typed artist name will not produce real songs.
        </p>
        {app.mockEnabled ? (
          <ul className="mt-2 text-sm">
            {app.externalHits.map((hit) => (
              <li key={hit.title}>
                Mock only: {hit.artist} — {hit.title}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!app.ready ? <p>Loading library…</p> : null}
      {app.ready && filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nothing in the library yet. Import a WAV, MP3, M4A, OGG, WebM, FLAC, or AAC file.</p>
      ) : null}
      <ul className="space-y-2">
        {filtered.map((entry) => (
          <li key={entry.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "#1c140e" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg">{entry.title}</p>
                <p className="text-sm text-[var(--muted)]">{entry.artist}</p>
                <p className="mt-1 text-xs text-[var(--moss)]">{app.labelsFor(entry).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" style={{ borderColor: "var(--line)" }} onClick={() => app.playTrack(entry.id, filtered.map((row) => row.id))}>
                  Play
                </button>
                {app.playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    className="rounded border px-3 py-1 text-sm"
                    style={{ borderColor: "var(--line)" }}
                    onClick={() => void app.addToPlaylist(playlist.id, entry.id)}
                  >
                    Add to {playlist.name}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
