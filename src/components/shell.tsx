"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useFujara } from "@/lib/fujara-context";

const LINKS = [
  { href: "/", label: "Library" },
  { href: "/playlists", label: "Playlists" },
  { href: "/downloads", label: "Downloads" },
  { href: "/settings", label: "Settings" },
];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const player = useFujara();

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-36 pt-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--gold)]">Personal music</p>
          <h1 className="text-4xl text-[var(--ink)]">Fujara</h1>
          <p className="max-w-xl text-sm text-[var(--muted)]">
            A local-first player. Imported audio stays in this browser. Cloud backup stays optional.
          </p>
        </div>
        <p className="text-sm text-[var(--muted)]" role="status">
          {player.offline ? "Offline" : "Online"} · {player.profile ? player.profile.name : "No local profile"}
        </p>
      </header>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Primary">
        {LINKS.map((link) => {
          const active = path === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border px-4 py-2 text-sm"
              style={{
                borderColor: active ? "var(--gold)" : "var(--line)",
                background: active ? "#3a2816" : "transparent",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <main className="flex-1">{children}</main>
      <footer
        className="fixed inset-x-0 bottom-0 border-t bg-[#1b120c]/95 px-4 py-3 backdrop-blur"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm">{player.currentEntry?.title ?? "Nothing playing"}</p>
              <p className="text-xs text-[var(--muted)]">{player.currentEntry?.artist ?? "Import a file to start"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--line)" }} onClick={player.prev}>
                Previous
              </button>
              <button
                type="button"
                className="rounded bg-[var(--gold)] px-4 py-1 text-[#1b120c]"
                onClick={player.toggle}
              >
                {player.playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--line)" }} onClick={player.next}>
                Next
              </button>
              <button type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--line)" }} onClick={player.toggleShuffle}>
                {player.shuffleOn ? "Shuffle on" : "Shuffle"}
              </button>
              <button type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--line)" }} onClick={player.cycleRepeat}>
                Repeat {player.repeatMode}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>{formatTime(player.currentTime)}</span>
            <input
              aria-label="Seek"
              className="w-full"
              type="range"
              min={0}
              max={player.duration || 0}
              step={0.1}
              value={Math.min(player.currentTime, player.duration || 0)}
              onChange={(event) => player.seek(Number(event.target.value))}
            />
            <span>{formatTime(player.duration)}</span>
            <input
              aria-label="Volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={player.volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
            />
          </label>
          {player.queue.length > 0 ? (
            <ol aria-label="Queue" className="max-h-24 overflow-auto text-xs">
              {player.queue.map((id, index) => {
                const title = player.entries.find((entry) => entry.id === id)?.title ?? "Untitled";
                const current = index === player.queueIndex;
                return (
                  <li
                    key={`${id}-${index}`}
                    aria-current={current ? "true" : undefined}
                    className={current ? "text-[var(--gold)]" : "text-[var(--muted)]"}
                  >
                    {title}
                    <button type="button" className="ml-2" aria-label={`Remove ${title} from queue`} onClick={() => player.removeFromQueue(index)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {player.playerError ? <p className="text-xs text-[#e7a08c]">{player.playerError}</p> : null}
        </div>
      </footer>
    </div>
  );
}
