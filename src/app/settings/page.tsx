"use client";

import { useState } from "react";
import { useFujara } from "@/lib/fujara-context";

export default function SettingsPage() {
  const app = useFujara();
  const [name, setName] = useState("");
  return (
    <section className="space-y-5">
      <h2 className="text-2xl">Settings</h2>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">This device</h3>
        <p className="text-sm text-[var(--muted)]">
          Local profiles only separate libraries inside this browser. They are not accounts and they do not unlock cloud APIs.
        </p>
        <p className="mt-2 text-sm">Active: {app.profile?.name ?? "Signed out of the local profile"}</p>
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
          <button className="rounded-full border px-4 py-2" style={{ borderColor: "var(--line)" }} type="submit">
            Switch to a new profile
          </button>
          <button className="rounded-full border px-4 py-2" style={{ borderColor: "var(--line)" }} type="button" onClick={app.signOutLocal}>
            Sign out locally
          </button>
        </form>
      </article>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">Google Drive</h3>
        <p className="text-sm">Not connected.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Backup uses your own Drive after you configure OAuth. Fujara does not ask for your Google password. No backup has been uploaded from this build.
        </p>
      </article>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">Cloud library</h3>
        <p className="text-sm">Not connected.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Metadata sync needs a database and a server session secret. Until then, library data stays in IndexedDB on this device.
        </p>
      </article>
      <article className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-lg">Recovery manifest</h3>
        <p className="text-sm text-[var(--muted)]">
          Exports titles, playlist order, and Drive file ids if any. It does not include audio bytes.
        </p>
        <button
          type="button"
          className="mt-3 rounded-full bg-[var(--gold)] px-4 py-2 text-sm text-[#1b120c]"
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
      </article>
    </section>
  );
}
