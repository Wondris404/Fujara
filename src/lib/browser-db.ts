import type { BackupRef, Job, LibraryEntry, LocalAudioMeta, Playlist, PlaylistItem } from "@/domain/types";

const DB_NAME = "fujara";
const DB_VERSION = 1;

export type AudioRow = LocalAudioMeta & { blob: Blob };

type StoreName = "entries" | "audio" | "playlists" | "items" | "backups" | "jobs" | "ops";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openFujaraDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("entries")) {
        const store = db.createObjectStore("entries", { keyPath: "id" });
        store.createIndex("byProfile", "profileId");
      }
      if (!db.objectStoreNames.contains("audio")) {
        const store = db.createObjectStore("audio", { keyPath: "id" });
        store.createIndex("byProfile", "profileId");
      }
      if (!db.objectStoreNames.contains("playlists")) {
        const store = db.createObjectStore("playlists", { keyPath: "id" });
        store.createIndex("byProfile", "profileId");
      }
      if (!db.objectStoreNames.contains("items")) {
        const store = db.createObjectStore("items", { keyPath: "id" });
        store.createIndex("byPlaylist", "playlistId");
      }
      if (!db.objectStoreNames.contains("backups")) {
        db.createObjectStore("backups", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("jobs")) {
        db.createObjectStore("jobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("ops")) {
        db.createObjectStore("ops", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function put<T>(db: IDBDatabase, store: StoreName, value: T): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
}

async function remove(db: IDBDatabase, store: StoreName, id: string): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

async function all<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  const tx = db.transaction(store, "readonly");
  const rows = await requestToPromise(tx.objectStore(store).getAll() as IDBRequest<T[]>);
  await txDone(tx);
  return rows;
}

// IDB cursors and getAll return the whole record. There is no cursor option
// that omits `blob`, so a list that never reads blob bytes needs a schema
// version bump (metadata store separate from the blob). DB_VERSION stays at 1
// and the audio store is unchanged so existing rows stay readable.
function audioMetaOnly(row: AudioRow): LocalAudioMeta {
  return {
    id: row.id,
    profileId: row.profileId,
    trackId: row.trackId,
    size: row.size,
    sha256: row.sha256,
    mime: row.mime,
  };
}

export async function listAudioMeta(db: IDBDatabase): Promise<LocalAudioMeta[]> {
  const tx = db.transaction("audio", "readonly");
  const rows: LocalAudioMeta[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = tx.objectStore("audio").openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      rows.push(audioMetaOnly(cursor.value as AudioRow));
      cursor.continue();
    };
  });
  await txDone(tx);
  return rows;
}

export async function commitStores(
  db: IDBDatabase,
  run: (stores: {
    audio: IDBObjectStore;
    entries: IDBObjectStore;
    jobs: IDBObjectStore;
  }) => void,
): Promise<void> {
  const tx = db.transaction(["audio", "entries", "jobs"], "readwrite");
  run({
    audio: tx.objectStore("audio"),
    entries: tx.objectStore("entries"),
    jobs: tx.objectStore("jobs"),
  });
  await txDone(tx);
}

export const browserDb = {
  putEntry: (db: IDBDatabase, entry: LibraryEntry) => put(db, "entries", entry),
  putAudio: (db: IDBDatabase, row: AudioRow) => put(db, "audio", row),
  putPlaylist: (db: IDBDatabase, playlist: Playlist) => put(db, "playlists", playlist),
  putItem: (db: IDBDatabase, item: PlaylistItem) => put(db, "items", item),
  putBackup: (db: IDBDatabase, backup: BackupRef) => put(db, "backups", backup),
  putJob: (db: IDBDatabase, job: Job) => put(db, "jobs", job),
  deleteEntry: (db: IDBDatabase, id: string) => remove(db, "entries", id),
  deleteAudio: (db: IDBDatabase, id: string) => remove(db, "audio", id),
  deleteItem: (db: IDBDatabase, id: string) => remove(db, "items", id),
  deleteBackup: (db: IDBDatabase, id: string) => remove(db, "backups", id),
  entries: (db: IDBDatabase) => all<LibraryEntry>(db, "entries"),
  audio: (db: IDBDatabase) => all<AudioRow>(db, "audio"),
  listAudioMeta,
  playlists: (db: IDBDatabase) => all<Playlist>(db, "playlists"),
  items: (db: IDBDatabase) => all<PlaylistItem>(db, "items"),
  backups: (db: IDBDatabase) => all<BackupRef>(db, "backups"),
  jobs: (db: IDBDatabase) => all<Job>(db, "jobs"),
  getAudio: async (db: IDBDatabase, id: string): Promise<AudioRow | undefined> => {
    const tx = db.transaction("audio", "readonly");
    const row = await requestToPromise(tx.objectStore("audio").get(id) as IDBRequest<AudioRow | undefined>);
    await txDone(tx);
    return row;
  },
};
