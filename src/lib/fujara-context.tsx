"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchArchiveAudio } from "@/domain/archive-fetch";
import { deleteDriveFile, downloadDriveBytes, ensureFujaraFolder, uploadResumable } from "@/domain/drive-transfer";
import { enqueueOp, settleSnapshot, type SyncOp } from "@/domain/op-queue";
import { adoptManifest, localLibraryManifest, parseManifest } from "@/domain/manifest";

import { availabilityFor, availabilityLabels } from "@/domain/labels";
import { classifyAudioFile, isQuotaError, metadataFromFilename } from "@/domain/import-policy";
import { planImport } from "@/domain/import-flow";
import { createLoadGate, queueIndexAfterEnd, shouldReloadAudio } from "@/domain/player-machine";
import { moveItem, orderedItems } from "@/domain/playlist";
import { missingLocalTracks } from "@/domain/reconcile";
import { sha256Hex } from "@/domain/hash";
import { searchMockCatalogue, type CatalogueHit } from "@/domain/sources";
import type { BackupRef, Job, LibraryEntry, Playlist, PlaylistItem } from "@/domain/types";
import { browserDb, commitStores, openFujaraDb, type AudioRow } from "./browser-db";

const PROFILE_KEY = "fujara.profileId";
const QUEUE_KEY = "fujara.queue";

type Profile = { id: string; name: string };

type Snapshot = {
  entries: LibraryEntry[];
  audio: AudioRow[];
  playlists: Playlist[];
  items: PlaylistItem[];
  backups: BackupRef[];
  jobs: Job[];
};

type FujaraContextValue = {
  ready: boolean;
  offline: boolean;
  profile: Profile | null;
  profiles: Profile[];
  entries: LibraryEntry[];
  playlists: Playlist[];
  items: PlaylistItem[];
  backups: BackupRef[];
  jobs: Job[];
  localIds: Set<string>;
  usedBytes: number;
  quotaBytes: number | null;
  persistent: boolean | null;
  storageNote: string;
  query: string;
  setQuery: (value: string) => void;
  importFiles: (files: FileList | File[]) => Promise<string>;
  removeLocal: (trackId: string) => Promise<void>;
  removeFromLibrary: (trackId: string) => Promise<void>;
  forgetBackupRef: (trackId: string) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  moveInPlaylist: (playlistId: string, trackId: string, direction: -1 | 1) => Promise<void>;
  switchProfile: (name: string) => Promise<void>;
  signOutLocal: () => void;
  chooseProfile: (id: string) => Promise<void>;
  renameActive: (name: string) => void;
  editEntry: (trackId: string, title: string, artist: string) => Promise<void>;
  toggleFavorite: (trackId: string) => Promise<void>;
  requestPersistent: () => Promise<void>;
  reconcile: () => string[];
  exportManifest: () => string;
  importManifest: (raw: string) => Promise<string>;
  importRemoteAudio: (input: { title: string; artist: string; audioUrl: string; pageUrl?: string; providerTrackId: string }) => Promise<string>;
  backupTrack: (trackId: string) => Promise<string>;
  restoreTrack: (trackId: string) => Promise<string>;
  deleteDriveBackup: (trackId: string) => Promise<string>;
  pushSync: () => Promise<string>;
  pullSync: () => Promise<string>;
  renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  removeFromQueue: (index: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  repeatMode: "off" | "all" | "one";
  shuffleOn: boolean;
  pendingOps: number;
  labelsFor: (entry: LibraryEntry) => string[];
  queue: string[];
  queueIndex: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playerError: string;
  playTrack: (trackId: string, queueIds?: string[]) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  next: () => void;
  prev: () => void;
  currentEntry: LibraryEntry | null;
  externalHits: CatalogueHit[];
  mockEnabled: boolean;
};

const FujaraContext = createContext<FujaraContextValue | null>(null);

function uid(): string {
  return crypto.randomUUID();
}

function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem("fujara.profiles");
    return raw ? (JSON.parse(raw) as Profile[]) : [];
  } catch {
    return [];
  }
}

export function FujaraProvider({ children }: { children: ReactNode }) {
  const dbRef = useRef<IDBDatabase | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const gateRef = useRef(createLoadGate());
  const loadedTrackRef = useRef<string | null>(null);
  const volumeRef = useRef(1);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [snap, setSnap] = useState<Snapshot>({
    entries: [],
    audio: [],
    playlists: [],
    items: [],
    backups: [],
    jobs: [],
  });
  const [quotaBytes, setQuotaBytes] = useState<number | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [playerError, setPlayerError] = useState("");
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [shuffleOn, setShuffleOn] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const [accountId, setAccountId] = useState<string | null>(null);
  const accountRef = useRef<string | null>(null);
  accountRef.current = accountId;
  const repeatRef = useRef(repeatMode);
  const queueLenRef = useRef(0);
  repeatRef.current = repeatMode;
  queueLenRef.current = queue.length;
  const [storageNote, setStorageNote] = useState("");

  const reload = useCallback(async (db: IDBDatabase, profileId: string) => {
    const [entries, audio, playlists, items, backups, jobs] = await Promise.all([
      browserDb.entries(db),
      browserDb.audio(db),
      browserDb.playlists(db),
      browserDb.items(db),
      browserDb.backups(db),
      browserDb.jobs(db),
    ]);
    setSnap({
      entries: entries.filter((row) => row.profileId === profileId && row.deletedAt === null),
      audio: audio.filter((row) => row.profileId === profileId),
      playlists: playlists.filter((row) => row.profileId === profileId),
      items,
      backups: backups.filter((row) => row.profileId === profileId),
      jobs: jobs.filter((row) => row.profileId === profileId),
    });
  }, []);

  useEffect(() => {
    void fetch("/api/auth/status")
      .then((response) => response.json())
      .then((body: { signedIn?: boolean; userId?: string | null }) => {
        const next = body.signedIn && body.userId ? body.userId : null;
        setAccountId(next);
        if (next) {
          const raw = localStorage.getItem(`fujara.ops.${next}`);
          const ops = raw ? (JSON.parse(raw) as SyncOp[]) : [];
          setPendingOps(ops.filter((op) => op.body.accountId === next).length);
        } else setPendingOps(0);
      })
      .catch(() => setAccountId(null));
  }, []);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.preload = "metadata";
    const onTime = () => setCurrentTime(element.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setQueueIndex((index) => {
        const next = queueIndexAfterEnd(index, queueLenRef.current, repeatRef.current);
        return next === null ? index : next;
      });
    };
    element.addEventListener("timeupdate", onTime);
    element.addEventListener("durationchange", onMeta);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onEnded);
    return () => {
      element.pause();
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("durationchange", onMeta);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("ended", onEnded);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    const onOff = () => setOffline(!navigator.onLine);
    onOff();
    window.addEventListener("online", onOff);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOff);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await openFujaraDb();
      if (cancelled) return;
      dbRef.current = db;
      const known = loadProfiles();
      setProfiles(known);
      const saved = localStorage.getItem(PROFILE_KEY);
      const active = known.find((item) => item.id === saved) ?? null;
      setProfile(active);
      if (active) await reload(db, active.id);
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setQuotaBytes(estimate.quota ?? null);
      }
      if (navigator.storage?.persisted) setPersistent(await navigator.storage.persisted());
      const storedQueue = sessionStorage.getItem(QUEUE_KEY);
      if (storedQueue) {
        const parsed = JSON.parse(storedQueue) as { ids: string[]; index: number };
        setQueue(parsed.ids);
        setQueueIndex(parsed.index);
      }
      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.register("/sw.js");
        } catch {
          setStorageNote("Service worker registration failed. Playback of imported files still uses device storage.");
        }
      }
      setReady(true);
    })().catch((error: unknown) => {
      setStorageNote(error instanceof Error ? error.message : "Storage failed to open.");
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const ensureProfile = useCallback(async () => {
    if (profile) return profile;
    const created: Profile = { id: uid(), name: "This device" };
    const next = [...loadProfiles(), created];
    localStorage.setItem("fujara.profiles", JSON.stringify(next));
    localStorage.setItem(PROFILE_KEY, created.id);
    setProfiles(next);
    setProfile(created);
    return created;
  }, [profile]);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files];
      const db = dbRef.current;
      if (!db) return "Storage is not open yet.";
      const active = await ensureProfile();
      const messages: string[] = [];
      for (const file of list) {
        const classified = classifyAudioFile(file.name, file.type, file.size);
        const job: Job = {
          id: uid(),
          profileId: active.id,
          kind: "import",
          state: "running",
          idempotencyKey: `${active.id}:${file.name}:${file.size}:${file.lastModified}`,
          updatedAt: new Date().toISOString(),
        };
        if (!classified.ok) {
          job.state = "failed";
          job.error = classified.reason;
          await browserDb.putJob(db, job);
          messages.push(classified.reason);
          continue;
        }
        try {
          const bytes = await file.arrayBuffer();
          const hash = await sha256Hex(bytes);
          const known = (await browserDb.entries(db)).filter((row) => row.profileId === active.id);
          const existing = known.find((row) => row.contentHash === hash) ?? null;
          const audioRows = await browserDb.audio(db);
          const hasLocalAudio = existing ? audioRows.some((row) => row.id === existing.id) : false;
          const decision = planImport({
            accepted: true,
            existing,
            hasLocalAudio,
          });
          const id = decision.action === "restore" ? decision.entryId : uid();
          const names = metadataFromFilename(file.name);
          const now = new Date().toISOString();
          const entry: LibraryEntry = {
            id,
            profileId: active.id,
            title: names.title,
            artist: names.artist,
            durationMs: null,
            mime: classified.mime,
            contentHash: hash,
            source: { provider: "local-file" },
            userEdited: false,
            favorite: false,
            deletedAt: null,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          await commitStores(db, (stores) => {
            if (decision.action !== "skip") {
              stores.audio.put({
                id,
                profileId: active.id,
                trackId: id,
                size: bytes.byteLength,
                sha256: hash,
                mime: classified.mime,
                blob: new Blob([bytes], { type: classified.mime }),
              });
            }
            if (decision.action === "create") stores.entries.put(entry);
            stores.jobs.put({
              ...job,
              state: "succeeded",
              trackId: decision.action === "create" ? id : existing?.id,
              error: decision.action === "skip" ? "Already stored. Edited metadata was kept." : undefined,
              updatedAt: now,
            });
          });
          messages.push(decision.action === "restore" ? `Restored audio for ${existing?.title}` : decision.action === "skip" ? `Already imported: ${existing?.title}` : `Saved offline: ${entry.title}`);
        } catch (error) {
          const text = isQuotaError(error)
            ? "Not enough browser storage. Nothing was marked available offline."
            : "Import failed and was not marked available offline.";
          messages.push(text);
        }
      }
      await reload(db, active.id);
      return messages.join(" ");
    },
    [ensureProfile, reload],
  );

  const removeLocal = useCallback(
    async (trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      await browserDb.deleteAudio(db, trackId);
      await reload(db, profile.id);
    },
    [profile, reload],
  );

  const rememberOp = useCallback((kind: SyncOp["kind"], body: Record<string, unknown>) => {
    const account = accountRef.current;
    if (!account) return;
    const id = crypto.randomUUID();
    const op: SyncOp = { id, kind, body: { ...body, opId: id, accountId: account }, attempts: 0 };
    const key = `fujara.ops.${account}`;
    const raw = localStorage.getItem(key);
    const existing = raw ? (JSON.parse(raw) as SyncOp[]) : [];
    const next = enqueueOp(existing, op);
    localStorage.setItem(key, JSON.stringify(next));
    setPendingOps(next.length);
  }, []);

  const removeFromLibrary = useCallback(
    async (trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const current = (await browserDb.entries(db)).find((row) => row.id === trackId && row.profileId === profile.id);
      if (current) {
        const tombstone = { ...current, deletedAt: new Date().toISOString(), version: current.version + 1, updatedAt: new Date().toISOString() };
        await browserDb.putEntry(db, tombstone);
        rememberOp("track", { id: tombstone.id, title: tombstone.title, artist: tombstone.artist, favorite: tombstone.favorite, version: tombstone.version, contentHash: tombstone.contentHash, sourceProvider: tombstone.source?.provider ?? null, sourcePageUrl: tombstone.source?.pageUrl ?? null, mime: tombstone.mime, deletedAt: tombstone.deletedAt });
      }
      await browserDb.deleteAudio(db, trackId);
      const items = await browserDb.items(db);
      for (const item of items.filter((row) => row.trackId === trackId)) {
        await browserDb.deleteItem(db, item.id);
      }
      await reload(db, profile.id);
    },
    [profile, reload, rememberOp],
  );

  const forgetBackupRef = useCallback(
    async (trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const backups = await browserDb.backups(db);
      for (const backup of backups.filter((row) => row.profileId === profile.id && row.trackId === trackId)) {
        await browserDb.deleteBackup(db, backup.id);
      }
      await reload(db, profile.id);
    },
    [profile, reload],
  );

  const createPlaylist = useCallback(
    async (name: string) => {
      const db = dbRef.current;
      if (!db || !name.trim()) return;
      const active = await ensureProfile();
      const playlist: Playlist = {
        id: uid(),
        profileId: active.id,
        name: name.trim(),
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      await browserDb.putPlaylist(db, playlist);
      rememberOp("playlist", { id: playlist.id, name: playlist.name, version: playlist.version, deletedAt: null, trackIds: [] });
      await reload(db, active.id);
    },
    [ensureProfile, reload, rememberOp],
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const items = (await browserDb.items(db)).filter((item) => item.playlistId === playlistId);
      if (items.some((item) => item.trackId === trackId)) return;
      await browserDb.putItem(db, {
        id: uid(),
        playlistId,
        trackId,
        position: items.length,
      });
      const ordered = [...items.map((item) => item.trackId), trackId];
      const lists = await browserDb.playlists(db);
      const list = lists.find((row) => row.id === playlistId);
      if (list) rememberOp("playlist", { id: list.id, name: list.name, version: list.version + 1, deletedAt: null, trackIds: ordered });
      const playlists = await browserDb.playlists(db);
      const playlist = playlists.find((row) => row.id === playlistId);
      if (playlist) {
        await browserDb.putPlaylist(db, {
          ...playlist,
          version: playlist.version + 1,
          updatedAt: new Date().toISOString(),
        });
      }
      await reload(db, profile.id);
    },
    [profile, reload, rememberOp],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const items = await browserDb.items(db);
      const target = items.find((item) => item.playlistId === playlistId && item.trackId === trackId);
      if (target) await browserDb.deleteItem(db, target.id);
      const lists = await browserDb.playlists(db);
      const list = lists.find((row) => row.id === playlistId);
      const remaining = items.filter((item) => item.playlistId === playlistId && item.trackId !== trackId).sort((a, b) => a.position - b.position);
      if (list) rememberOp("playlist", { id: list.id, name: list.name, version: list.version + 1, deletedAt: null, trackIds: remaining.map((item) => item.trackId) });
      await reload(db, profile.id);
    },
    [profile, reload, rememberOp],
  );

  const moveInPlaylist = useCallback(
    async (playlistId: string, trackId: string, direction: -1 | 1) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const items = await browserDb.items(db);
      const next = moveItem(items, playlistId, trackId, direction);
      for (const item of next.filter((row) => row.playlistId === playlistId)) {
        await browserDb.putItem(db, item);
      }
      const lists = await browserDb.playlists(db);
      const list = lists.find((row) => row.id === playlistId);
      const ordered = next.filter((row) => row.playlistId === playlistId).sort((a, b) => a.position - b.position);
      if (list) rememberOp("playlist", { id: list.id, name: list.name, version: list.version + 1, deletedAt: null, trackIds: ordered.map((item) => item.trackId) });
      await reload(db, profile.id);
    },
    [profile, reload, rememberOp],
  );

  const switchProfile = useCallback(
    async (name: string) => {
      const db = dbRef.current;
      if (!db || !name.trim()) return;
      const created: Profile = { id: uid(), name: name.trim() };
      const next = [...loadProfiles(), created];
      localStorage.setItem("fujara.profiles", JSON.stringify(next));
      localStorage.setItem(PROFILE_KEY, created.id);
      setProfiles(next);
      setProfile(created);
      setQueue([]);
      setQueueIndex(0);
      loadedTrackRef.current = null;
      gateRef.current.start();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
      }
      await reload(db, created.id);
    },
    [reload],
  );

  const clearPlayer = useCallback(() => {
    setQueue([]);
    setQueueIndex(0);
    loadedTrackRef.current = null;
    gateRef.current.start();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  }, []);

  const signOutLocal = useCallback(() => {
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setSnap({ entries: [], audio: [], playlists: [], items: [], backups: [], jobs: [] });
    clearPlayer();
  }, [clearPlayer]);

  const chooseProfile = useCallback(
    async (id: string) => {
      const db = dbRef.current;
      const match = loadProfiles().find((item) => item.id === id);
      if (!db || !match) return;
      localStorage.setItem(PROFILE_KEY, match.id);
      setProfile(match);
      clearPlayer();
      const stored = sessionStorage.getItem(`${QUEUE_KEY}.${match.id}`);
      if (stored) {
        const parsed = JSON.parse(stored) as { ids: string[]; index: number };
        setQueue(parsed.ids);
        setQueueIndex(parsed.index);
      }
      await reload(db, match.id);
    },
    [clearPlayer, reload],
  );

  const renameActive = useCallback((name: string) => {
    if (!profile) return;
    const next = loadProfiles().map((item) => (item.id === profile.id ? { ...item, name: name.trim() || item.name } : item));
    localStorage.setItem("fujara.profiles", JSON.stringify(next));
    setProfiles(next);
    const updated = next.find((item) => item.id === profile.id) ?? null;
    setProfile(updated);
  }, [profile]);

  const editEntry = useCallback(
    async (trackId: string, title: string, artist: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const current = (await browserDb.entries(db)).find((row) => row.id === trackId && row.profileId === profile.id);
      if (!current) return;
      const updated = {
        ...current,
        title: title.trim() || current.title,
        artist: artist.trim() || current.artist,
        userEdited: true,
        version: (current.version ?? 1) + 1,
        updatedAt: new Date().toISOString(),
      };
      await browserDb.putEntry(db, updated);
      rememberOp("track", { opId: crypto.randomUUID(), id: updated.id, title: updated.title, artist: updated.artist, favorite: updated.favorite, version: updated.version, contentHash: updated.contentHash, sourceProvider: updated.source?.provider ?? null, deletedAt: updated.deletedAt });
      await reload(db, profile.id);
    },
    [profile, reload, rememberOp],
  );

  const toggleFavorite = useCallback(
    async (trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const current = (await browserDb.entries(db)).find((row) => row.id === trackId && row.profileId === profile.id);
      if (!current) return;
      const updated = { ...current, favorite: !current.favorite, version: (current.version ?? 1) + 1, updatedAt: new Date().toISOString() };
      await browserDb.putEntry(db, updated);
      rememberOp("track", { id: updated.id, title: updated.title, artist: updated.artist, favorite: updated.favorite, version: updated.version, contentHash: updated.contentHash, sourceProvider: updated.source?.provider ?? null, sourcePageUrl: updated.source?.pageUrl ?? null, mime: updated.mime, deletedAt: updated.deletedAt });
      await reload(db, profile.id);
    },
    [profile, reload, rememberOp],
  );

  const requestPersistent = useCallback(async () => {
    if (!navigator.storage?.persist) {
      setPersistent(false);
      setStorageNote("This browser does not support persistent storage requests.");
      return;
    }
    const granted = await navigator.storage.persist();
    setPersistent(granted);
    setStorageNote(granted ? "Persistent storage granted." : "Persistent storage was not granted.");
  }, []);

  const localIds = useMemo(() => new Set(snap.audio.map((row) => row.trackId)), [snap.audio]);
  const usedBytes = useMemo(() => snap.audio.reduce((sum, row) => sum + row.size, 0), [snap.audio]);

  const entriesRef = useRef(snap.entries);
  entriesRef.current = snap.entries;

  useEffect(() => {
    if (shouldReloadAudio("volume")) return;
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!shouldReloadAudio("track")) return;
    const id = queue[queueIndex];
    const profileId = profile?.id;
    if (profileId) sessionStorage.setItem(`${QUEUE_KEY}.${profileId}`, JSON.stringify({ ids: queue, index: queueIndex }));
    if (!id) return;
    const ticket = gateRef.current.start();
    const db = dbRef.current;
    const element = audioRef.current;
    if (!db || !element) return;
    void (async () => {
      const row = await browserDb.getAudio(db, id);
      if (!gateRef.current.isCurrent(ticket)) return;
      if (!row || row.profileId !== profileId) {
        setPlayerError("This track is not available offline on this device.");
        setPlaying(false);
        return;
      }
      if (loadedTrackRef.current !== id) {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(row.blob);
        urlRef.current = url;
        element.src = url;
        loadedTrackRef.current = id;
      }
      element.volume = volumeRef.current;
      setPlayerError("");
      try {
        await element.play();
        const entry = entriesRef.current.find((item) => item.id === id);
        if ("mediaSession" in navigator && entry) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: entry.title,
            artist: entry.artist,
            album: "Fujara",
          });
          navigator.mediaSession.setActionHandler("play", () => void element.play());
          navigator.mediaSession.setActionHandler("pause", () => element.pause());
          navigator.mediaSession.setActionHandler("nexttrack", () => setQueueIndex((index) => index + 1));
          navigator.mediaSession.setActionHandler("previoustrack", () => setQueueIndex((index) => Math.max(0, index - 1)));
        }
      } catch (error) {
        if (!gateRef.current.isCurrent(ticket)) return;
        setPlayerError(error instanceof Error ? error.message : "Playback was blocked.");
      }
    })();
  }, [queue, queueIndex, profile?.id]);

  const playTrack = useCallback((trackId: string, queueIds?: string[]) => {
    const ids = queueIds && queueIds.length > 0 ? queueIds : [trackId];
    const index = Math.max(0, ids.indexOf(trackId));
    setQueue(ids);
    setQueueIndex(index);
  }, []);

  const value: FujaraContextValue = {
    ready,
    offline,
    profile,
    profiles,
    entries: snap.entries,
    playlists: snap.playlists,
    items: snap.items,
    backups: snap.backups,
    jobs: snap.jobs,
    localIds,
    usedBytes,
    quotaBytes,
    persistent,
    storageNote,
    query,
    setQuery,
    importFiles,
    removeLocal,
    removeFromLibrary,
    forgetBackupRef,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    moveInPlaylist,
    switchProfile,
    signOutLocal,
    chooseProfile,
    renameActive,
    editEntry,
    toggleFavorite,
    requestPersistent,
    reconcile: () => missingLocalTracks(snap.entries, localIds),
    importRemoteAudio: async (input) => {
      const db = dbRef.current;
      if (!db) return "Storage is not open yet.";
      const active = await ensureProfile();
      try {
        const saved = await fetchArchiveAudio(input.audioUrl);
        const copy = new Uint8Array(saved.bytes);
        const hash = await sha256Hex(copy.buffer);
        const id = uid();
        const now = new Date().toISOString();
        await commitStores(db, (stores) => {
          stores.audio.put({
            id,
            profileId: active.id,
            trackId: id,
            size: copy.byteLength,
            sha256: hash,
            mime: saved.mime,
            blob: new Blob([copy], { type: saved.mime }),
          });
          stores.entries.put({
            id,
            profileId: active.id,
            title: input.title,
            artist: input.artist,
            durationMs: null,
            mime: saved.mime,
            contentHash: hash,
            source: { provider: "internet-archive", pageUrl: input.pageUrl, providerTrackId: input.providerTrackId },
            userEdited: false,
            favorite: false,
            deletedAt: null,
            version: 1,
            createdAt: now,
            updatedAt: now,
          });
        });
        await reload(db, active.id);
        return `Saved offline: ${input.title}`;
      } catch (error) {
        return error instanceof Error ? error.message : "Download failed. Nothing was marked offline.";
      }
    },
    backupTrack: async (trackId) => {
      const db = dbRef.current;
      if (!db || !profile) return "Choose a local profile first.";
      const accessResponse = await fetch("/api/drive/access", { method: "POST" });
      const access = (await accessResponse.json()) as { accessToken?: string };
      if (!accessResponse.ok || !access.accessToken) return "Drive is not connected for this account. Nothing was uploaded.";
      const row = await browserDb.getAudio(db, trackId);
      const entry = snap.entries.find((item) => item.id === trackId);
      if (!row?.blob || !entry) return "Local audio is missing, so there is nothing to back up.";
      const bytes = new Uint8Array(await row.blob.arrayBuffer());
      if (snap.backups.some((backup) => backup.trackId === trackId && backup.status === "verified")) {
        return "This track already has a Drive backup. Reconnect does not upload a second copy.";
      }
      try {
        const folderId = await ensureFujaraFolder(access.accessToken);
        const uploaded = await uploadResumable({
          accessToken: access.accessToken,
          filename: `${entry.title}.audio`,
          mime: row.mime,
          bytes,
          parentId: folderId,
        });
        const backupId = uid();
        await browserDb.putBackup(db, {
          id: backupId,
          profileId: profile.id,
          trackId,
          provider: "google-drive",
          fileId: uploaded.fileId,
          status: "verified",
          checksum: await sha256Hex(new Uint8Array(bytes).buffer),
          filename: uploaded.name,
          mime: row.mime,
          updatedAt: new Date().toISOString(),
        });
        rememberOp("backup", { id: backupId, trackId, fileId: uploaded.fileId, checksum: await sha256Hex(new Uint8Array(bytes).buffer), filename: uploaded.name, mime: row.mime, status: "verified" });
        await reload(db, profile.id);
        return `Backed up ${entry.title}.`;
      } catch (error) {
        return error instanceof Error ? error.message : "Backup failed. No Drive file id was stored.";
      }
    },
    restoreTrack: async (trackId) => {
      const db = dbRef.current;
      if (!db || !profile) return "Choose a local profile first.";
      const backup = snap.backups.find((item) => item.trackId === trackId && item.fileId);
      if (!backup) return "No Drive backup reference for this track.";
      const accessResponse = await fetch("/api/drive/access", { method: "POST" });
      const access = (await accessResponse.json()) as { accessToken?: string };
      if (!accessResponse.ok || !access.accessToken) return "Drive is not connected. Local files were not changed.";
      try {
        const bytes = await downloadDriveBytes(access.accessToken, backup.fileId);
        const copy = new Uint8Array(bytes);
        const hash = await sha256Hex(copy.buffer);
        if (backup.checksum && hash !== backup.checksum) return "Checksum did not match. The file was not saved.";
        await browserDb.putAudio(db, {
          id: trackId,
          profileId: profile.id,
          trackId,
          size: copy.byteLength,
          sha256: hash,
          mime: backup.mime,
          blob: new Blob([copy], { type: backup.mime }),
        });
        await reload(db, profile.id);
        return "Restored audio onto this device.";
      } catch (error) {
        return error instanceof Error ? error.message : "Restore failed.";
      }
    },
    deleteDriveBackup: async (trackId) => {
      const db = dbRef.current;
      if (!db || !profile) return "Choose a local profile first.";
      const backup = snap.backups.find((item) => item.trackId === trackId);
      if (!backup) return "No backup reference.";
      const accessResponse = await fetch("/api/drive/access", { method: "POST" });
      const access = (await accessResponse.json()) as { accessToken?: string };
      if (!accessResponse.ok || !access.accessToken) return "Drive is not connected. The reference was kept.";
      try {
        await deleteDriveFile(access.accessToken, backup.fileId);
        await browserDb.deleteBackup(db, backup.id);
        await reload(db, profile.id);
        return "Deleted the Drive file and the backup reference. Local audio was kept.";
      } catch (error) {
        return error instanceof Error ? error.message : "Drive delete failed. The reference was kept.";
      }
    },
    pushSync: async () => {
      const account = accountRef.current;
      if (!account) return "Sign in before syncing. Local playback does not need an account.";
      const key = `fujara.ops.${account}`;
      const raw = localStorage.getItem(key);
      const ops = (raw ? (JSON.parse(raw) as SyncOp[]) : []).filter((op) => op.body.accountId === account);
      if (ops.length === 0) return "No pending metadata changes for this account.";
      try {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tracks: ops.filter((op) => op.kind === "track").map((op) => op.body),
            playlists: ops.filter((op) => op.kind === "playlist").map((op) => op.body),
            backups: ops.filter((op) => op.kind === "backup").map((op) => op.body),
          }),
        });
        const body = (await response.json()) as { applied?: string[]; failed?: { id: string; error: string }[]; error?: string };
        if (!response.ok) return body.error ?? "Sync failed. Pending changes stayed on this device.";
        const latest = JSON.parse(localStorage.getItem(key) || "[]") as SyncOp[];
        const next = settleSnapshot(latest, ops, body.applied ?? [], body.failed ?? []);
        localStorage.setItem(key, JSON.stringify(next));
        setPendingOps(next.length);
        const stale = (body.failed ?? []).some((item) => item.error === "stale" || item.error === "conflict");
        return stale ? "A newer cloud change blocked some edits. They stayed on this device." : next.length === 0 ? "Metadata sync finished." : "Some metadata changes still need a retry.";
      } catch {
        return "Offline. Metadata changes stayed in the local queue.";
      }
    },
    pullSync: async () => {
      const db = dbRef.current;
      if (!db || !profile) return "Choose a local profile first.";
      const response = await fetch("/api/sync");
      if (!response.ok) return "Cloud library is not available. Local audio was not changed.";
      const body = (await response.json()) as {
        tracks?: { id: string; title: string; artist: string; favorite: boolean; version: number; updatedAt: string; deletedAt: string | null; contentHash: string | null; sourceProvider: string | null; sourcePageUrl?: string | null }[];
        playlists?: { id: string; name: string; version: number; updatedAt: string; deletedAt: string | null; trackIds: string[] }[];
        backups?: { id?: string; trackId: string; fileId: string; checksum?: string; filename: string; mime: string; status?: string }[];
      };
      const manifest = adoptManifest(parseManifest({ version: 1, tracks: body.tracks ?? [], playlists: body.playlists ?? [], backups: body.backups ?? [] }), profile.id);
      for (const track of manifest.tracks) {
        const existing = snap.entries.find((entry) => entry.id === track.id);
        if (existing && existing.version > track.version) continue;
        await browserDb.putEntry(db, {
          id: track.id,
          profileId: profile.id,
          title: track.title,
          artist: track.artist,
          durationMs: existing?.durationMs ?? null,
          mime: existing?.mime ?? "audio/mpeg",
          contentHash: track.contentHash,
          source: track.sourceProvider ? { provider: track.sourceProvider, pageUrl: track.sourcePageUrl ?? undefined } : null,
          userEdited: existing?.userEdited ?? false,
          favorite: track.favorite,
          deletedAt: track.deletedAt,
          version: track.version,
          createdAt: existing?.createdAt ?? track.updatedAt,
          updatedAt: track.updatedAt,
        });
      }
      for (const playlist of manifest.playlists) {
        if (playlist.deletedAt) {
          const items = await browserDb.items(db);
          for (const item of items.filter((row) => row.playlistId === playlist.id)) await browserDb.deleteItem(db, item.id);
          await browserDb.deletePlaylist(db, playlist.id);
          continue;
        }
        const local = snap.playlists.find((row) => row.id === playlist.id);
        if (local && local.version > playlist.version) continue;
        await browserDb.putPlaylist(db, { id: playlist.id, profileId: profile.id, name: playlist.name, version: playlist.version, updatedAt: playlist.updatedAt });
        const existingItems = (await browserDb.items(db)).filter((item) => item.playlistId === playlist.id);
        for (const item of existingItems) await browserDb.deleteItem(db, item.id);
        for (let position = 0; position < playlist.trackIds.length; position += 1) {
          const trackId = playlist.trackIds[position];
          await browserDb.putItem(db, { id: `${playlist.id}:${trackId}`, playlistId: playlist.id, trackId, position });
        }
      }
      for (const backup of manifest.backups) {
        if (!backup.trackId || !backup.fileId || !backup.filename || !backup.mime) continue;
        await browserDb.putBackup(db, {
          id: `${profile.id}:${backup.trackId}`,
          profileId: profile.id,
          trackId: backup.trackId,
          provider: "google-drive",
          fileId: backup.fileId,
          status: "verified",
          checksum: backup.checksum,
          filename: backup.filename,
          mime: backup.mime,
          updatedAt: new Date().toISOString(),
        });
      }
      await reload(db, profile.id);
      return "Metadata pulled. Tracks are not marked downloaded until audio exists on this device.";
    },
    renamePlaylist: async (playlistId, name) => {
      const db = dbRef.current;
      if (!db || !profile || !name.trim()) return;
      const current = (await browserDb.playlists(db)).find((row) => row.id === playlistId && row.profileId === profile.id);
      if (!current) return;
      const updated = { ...current, name: name.trim(), version: current.version + 1, updatedAt: new Date().toISOString() };
      await browserDb.putPlaylist(db, updated);
      const items = (await browserDb.items(db)).filter((item) => item.playlistId === playlistId).sort((a, b) => a.position - b.position);
      rememberOp("playlist", { id: updated.id, name: updated.name, version: updated.version, deletedAt: null, trackIds: items.map((item) => item.trackId) });
      await reload(db, profile.id);
    },
    deletePlaylist: async (playlistId) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const items = await browserDb.items(db);
      for (const item of items.filter((row) => row.playlistId === playlistId)) await browserDb.deleteItem(db, item.id);
      const current = (await browserDb.playlists(db)).find((row) => row.id === playlistId);
      await browserDb.deletePlaylist(db, playlistId);
      if (current) rememberOp("playlist", { id: current.id, name: current.name, version: current.version + 1, deletedAt: new Date().toISOString(), trackIds: [] });
      await reload(db, profile.id);
    },
    removeFromQueue: (index) => {
      setQueue((ids) => ids.filter((_, itemIndex) => itemIndex !== index));
      setQueueIndex((current) => (index < current ? current - 1 : current));
    },
    toggleShuffle: () => {
      setShuffleOn((on) => !on);
      setQueue((ids) => {
        if (ids.length < 2) return ids;
        const current = ids[queueIndex] ?? ids[0];
        const rest = ids.filter((id) => id !== current);
        for (let index = rest.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(Math.random() * (index + 1));
          const hold = rest[index];
          rest[index] = rest[swap];
          rest[swap] = hold;
        }
        return [current, ...rest];
      });
      setQueueIndex(0);
    },
    cycleRepeat: () => setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off")),
    repeatMode,
    shuffleOn,
    pendingOps,
    exportManifest: () =>
      JSON.stringify(
        localLibraryManifest({
          profileId: profile?.id ?? "local",
          entries: snap.entries,
          playlists: snap.playlists,
          items: snap.items,
          backups: snap.backups,
        }),
        null,
        2,
      ),
    importManifest: async (raw: string) => {
      const active = profile;
      const db = dbRef.current;
      if (!active || !db) return "Choose a local profile before importing a manifest.";
      let adopted;
      try {
        adopted = adoptManifest(parseManifest(JSON.parse(raw) as unknown), active.id);
      } catch (error) {
        return error instanceof Error ? error.message : "Unsupported manifest.";
      }
      for (const track of adopted.tracks) {
        const existing = snap.entries.find((entry) => entry.id === track.id);
        await browserDb.putEntry(db, {
          id: track.id,
          profileId: active.id,
          title: track.title,
          artist: track.artist,
          durationMs: existing?.durationMs ?? null,
          mime: existing?.mime ?? "audio/mpeg",
          contentHash: track.contentHash,
          source: track.sourceProvider ? { provider: track.sourceProvider } : existing?.source ?? null,
          userEdited: existing?.userEdited ?? false,
          favorite: track.favorite,
          deletedAt: track.deletedAt,
          version: track.version,
          createdAt: existing?.createdAt ?? track.updatedAt,
          updatedAt: track.updatedAt,
        });
      }
      for (const playlist of adopted.playlists) {
        await browserDb.putPlaylist(db, {
          id: playlist.id,
          profileId: active.id,
          name: playlist.name,
          version: playlist.version,
          updatedAt: playlist.updatedAt,
        });
        for (let position = 0; position < playlist.trackIds.length; position += 1) {
          const trackId = playlist.trackIds[position];
          await browserDb.putItem(db, { id: `${playlist.id}:${trackId}`, playlistId: playlist.id, trackId, position });
        }
      }
      for (const backup of adopted.backups) {
        if (!backup.trackId || !backup.fileId || !backup.filename || !backup.mime) continue;
        await browserDb.putBackup(db, {
          id: `${active.id}:${backup.trackId}`,
          profileId: active.id,
          trackId: backup.trackId,
          provider: "google-drive",
          fileId: backup.fileId,
          status: "verified",
          checksum: backup.checksum,
          filename: backup.filename,
          mime: backup.mime,
          updatedAt: new Date().toISOString(),
        });
      }
      await reload(db, active.id);
      const missing = adopted.tracks.filter((track) => track.deletedAt === null).length;
      return `Imported metadata for ${missing} tracks. Audio is not in the file. Restore bytes from this device or from Drive.`;
    },
    labelsFor: (entry) =>
      availabilityLabels(
        availabilityFor({
          inLibrary: true,
          hasLocalAudio: localIds.has(entry.id),
          backup: snap.backups.find((backup) => backup.trackId === entry.id) ?? null,
          job: [...snap.jobs].reverse().find((job) => job.trackId === entry.id) ?? null,
        }),
      ),
    queue,
    queueIndex,
    playing,
    currentTime,
    duration,
    volume,
    playerError,
    playTrack,
    toggle: () => {
      const element = audioRef.current;
      if (!element) return;
      if (element.paused) void element.play();
      else element.pause();
    },
    seek: (seconds: number) => {
      if (audioRef.current) audioRef.current.currentTime = seconds;
    },
    setVolume: (nextVolume: number) => {
      setVolumeState(nextVolume);
      if (audioRef.current) audioRef.current.volume = nextVolume;
    },
    next: () => setQueueIndex((index) => Math.min(queue.length - 1, index + 1)),
    prev: () => setQueueIndex((index) => Math.max(0, index - 1)),
    currentEntry: snap.entries.find((entry) => entry.id === queue[queueIndex]) ?? null,
    externalHits:
      process.env.NEXT_PUBLIC_ENABLE_MOCK_SOURCE === "true" ? searchMockCatalogue(query) : [],
    mockEnabled: process.env.NEXT_PUBLIC_ENABLE_MOCK_SOURCE === "true",
  };

  return (
    <FujaraContext.Provider value={value}>
      <audio ref={audioRef} className="hidden" preload="metadata" />
      {children}
    </FujaraContext.Provider>
  );
}

export function useFujara(): FujaraContextValue {
  const value = useContext(FujaraContext);
  if (!value) throw new Error("useFujara must be used inside FujaraProvider");
  return value;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function playlistTracks(items: PlaylistItem[], playlistId: string): PlaylistItem[] {
  return orderedItems(items, playlistId);
}
