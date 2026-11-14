"use client";

import { formatBytes, useFujara } from "@/lib/fujara-context";

export default function DownloadsPage() {
  const app = useFujara();
  const missing = app.reconcile();
  return (
    <section className="space-y-4">
      <h2 className="text-2xl">Downloads</h2>
      <p className="text-sm text-[var(--muted)]">
        Used on this device: {formatBytes(app.usedBytes)}
        {app.quotaBytes ? ` of about ${formatBytes(app.quotaBytes)} browser quota` : ""}. Persistent storage:{" "}
        {app.persistent === null ? "unknown" : app.persistent ? "granted" : "not granted"}.
      </p>
      <button type="button" className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--line)" }} onClick={() => void app.requestPersistent()}>
        Request persistent storage
      </button>
      {app.storageNote ? <p className="text-sm">{app.storageNote}</p> : null}
      {app.entries.length === 0 ? <p className="text-sm text-[var(--muted)]">No local audio yet.</p> : null}
      <ul className="space-y-2">
        {app.entries.map((entry) => {
          const offline = app.localIds.has(entry.id);
          return (
            <li key={entry.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
              <p>{entry.title}</p>
              <p className="text-xs text-[var(--moss)]">{app.labelsFor(entry).join(" · ")}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <button type="button" disabled={!offline} onClick={() => void app.removeLocal(entry.id)}>
                  Remove local download
                </button>
                <button type="button" onClick={() => void app.forgetBackupRef(entry.id)}>
                  Delete Drive backup reference
                </button>
                <button type="button" onClick={() => void app.removeFromLibrary(entry.id)}>
                  Remove from library
                </button>
              </div>
              {!offline ? <p className="text-xs text-[var(--muted)]">Audio bytes are not on this device.</p> : null}
            </li>
          );
        })}
      </ul>
      {missing.length > 0 ? (
        <p className="text-sm">Reconciled: {missing.length} library row(s) have no local file. They stay in the library and are not marked offline.</p>
      ) : null}
      <h3 className="text-lg">Recent jobs</h3>
      {app.jobs.length === 0 ? <p className="text-sm text-[var(--muted)]">No import jobs yet.</p> : null}
      <ul className="space-y-1 text-sm">
        {app.jobs.slice(-8).reverse().map((job) => (
          <li key={job.id}>
            {job.kind} · {job.state}
            {job.error ? ` · ${job.error}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
