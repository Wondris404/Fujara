"use client";

import { useEffect, useState } from "react";
import { useFujara } from "@/lib/fujara-context";

export default function SettingsPage() {
  const app = useFujara();
  const [name, setName] = useState("");
  const [account, setAccount] = useState("Checking account…");
  const [drive, setDrive] = useState("Checking Drive…");
  const [note, setNote] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/status")
      .then((response) => response.json())
      .then((body: { signedIn?: boolean; configured?: boolean; database?: boolean }) => {
        setSignedIn(Boolean(body.signedIn));
        if (!body.configured) setAccount("Google sign-in is not configured on this server.");
        else if (body.signedIn) setAccount(body.database ? "Signed in. Metadata can sync." : "Signed in. Add DATABASE_URL before metadata sync.");
        else setAccount("Not signed in. Local playback stays on this device.");
      })
      .catch(() => setAccount("Account status is unavailable."));
    void fetch("/api/drive/status")
      .then((response) => response.json())
      .then((body: { connected?: boolean; configured?: boolean }) => {
        if (!body.configured) setDrive("Drive backup is not configured on this server.");
        else setDrive(body.connected ? "Drive is connected for this account. No upload has run from this page yet." : "Drive is not connected.");
      })
      .catch(() => setDrive("Drive status is unavailable."));
  }, []);
  return (
    <section className="space-y-5">
      <h2 className="text-2xl">Settings</h2>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">This device</h3>
        <p className="text-sm text-[var(--muted)]">
          Local profiles only separate libraries inside this browser. Local profiles are not a cloud login. They are not accounts and they do not unlock cloud APIs.
        </p>
        <p className="mt-2 text-sm">Active device profile: {app.profile?.name ?? "None selected. This is not a cloud sign-in."}</p>
        {app.profiles.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No local profiles on this device yet.</p> : null}
        <ul className="mt-3 flex flex-wrap gap-2">
          {app.profiles.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-label={`Choose local profile ${item.name}`}
                aria-pressed={app.profile?.id === item.id}
                className="rounded-full border px-3 py-1 text-sm"
                style={{ borderColor: "var(--line)" }}
                onClick={() => void app.chooseProfile(item.id)}
              >
                Open {item.name}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void app.switchProfile(name);
            setName("");
          }}
        >
          <input
            aria-label="New local profile name"
            className="rounded-full border bg-transparent px-4 py-2"
            style={{ borderColor: "var(--line)" }}
            value={name}
            placeholder="Another local profile"
            onChange={(event) => setName(event.target.value)}
          />
          <button className="rounded-full border px-4 py-2" style={{ borderColor: "var(--line)" }} type="submit" aria-label="Create and switch to a new local profile">
            Switch to a new profile
          </button>
          <button className="rounded-full border px-4 py-2" style={{ borderColor: "var(--line)" }} type="button" aria-label="Leave the active local profile" onClick={app.signOutLocal}>
            Leave local profile
          </button>
        </form>
      </article>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">Account</h3>
        <p className="text-sm">{account}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--line)" }} href="/api/auth/google/start">
            Sign in with Google
          </a>
          <button
            type="button"
            className="rounded-full border px-4 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
            onClick={() => {
              void fetch("/api/auth/signout", { method: "POST" }).then(() => {
                setSignedIn(false);
                setAccount("Not signed in. Local playback stays on this device.");
              });
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm text-[#1b120c]"
            disabled={!signedIn}
            onClick={() => {
              const manifest = JSON.parse(app.exportManifest()) as { tracks?: { id: string; title: string; artist: string; favorite: boolean; version: number; contentHash: string | null; sourceProvider: string | null; deletedAt: string | null }[] };
              void (async () => {
                for (const track of manifest.tracks ?? []) {
                  const response = await fetch("/api/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(track),
                  });
                  if (!response.ok) {
                    setNote("Could not add the local library to the account.");
                    return;
                  }
                }
                setNote("Local metadata was sent to the signed-in account. Audio stayed on this device.");
              })();
            }}
          >
            Add local library to signed-in account
          </button>
        </div>
      </article>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">Google Drive</h3>
        <p className="text-sm">{drive}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Drive is a separate permission from sign-in. Fujara does not ask for your Google password. Connecting Drive does not upload audio.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--line)" }} href="/api/drive/start">
            Connect Drive
          </a>
          <button
            type="button"
            className="rounded-full border px-4 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
            onClick={() => {
              void fetch("/api/drive/disconnect", { method: "POST" }).then(() => setDrive("Drive is not connected."));
            }}
          >
            Disconnect Drive
          </button>
        </div>
      </article>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">Recovery manifest</h3>
        <p className="text-sm text-[var(--muted)]">
          Exports titles, playlist order, and Drive file ids if any. It does not include audio bytes.
        </p>
        <button
          type="button"
          className="mt-3 rounded-full bg-[var(--gold)] px-4 py-2 text-sm text-[#1b120c]"
          aria-label="Download recovery manifest"
          onClick={() => {
            const blob = new Blob([app.exportManifest()], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "fujara-manifest.json";
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download manifest
        </button>
        <label className="mt-3 block text-sm">
          Import manifest
          <input
            className="mt-2 block"
            type="file"
            accept="application/json"
            aria-label="Import recovery manifest"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((raw) => app.importManifest(raw).then(setNote));
            }}
          />
        </label>
        {note ? <p className="mt-2 text-sm">{note}</p> : null}
      </article>
    </section>
  );
}
