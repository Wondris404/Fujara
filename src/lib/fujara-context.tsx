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
import { availabilityFor, availabilityLabels } from "@/domain/labels";
import { classifyAudioFile, isQuotaError, metadataFromFilename } from "@/domain/import-policy";
import { moveItem, orderedItems } from "@/domain/playlist";
import { missingLocalTracks } from "@/domain/reconcile";
import { sha256Hex } from "@/domain/hash";
import { searchMockCatalogue, type CatalogueHit } from "@/domain/sources";
import type { BackupRef, Job, LibraryEntry, Playlist, PlaylistItem } from "@/domain/types";
import { browserDb, openFujaraDb, type AudioRow } from "./browser-db";

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
  requestPersistent: () => Promise<void>;
  reconcile: () => string[];
  exportManifest: () => string;
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
      entries: entries.filter((row) => row.profileId === profileId),
      audio: audio.filter((row) => row.profileId === profileId),
      playlists: playlists.filter((row) => row.profileId === profileId),
      items,
      backups: backups.filter((row) => row.profileId === profileId),
      jobs: jobs.filter((row) => row.profileId === profileId),
    });
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
      setQueueIndex((index) => index + 1);
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
      const db = dbRef.current;
      if (!db) return "Storage is not open yet.";
      const active = await ensureProfile();
      const list = [...files];
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
          const existing = (await browserDb.entries(db)).find(
            (entry) => entry.profileId === active.id && entry.contentHash === hash,
          );
          if (existing) {
            job.state = "succeeded";
            job.trackId = existing.id;
            job.error = "Already in the library. Existing title and artist were kept.";
            await browserDb.putJob(db, job);
            messages.push(`Already imported: ${existing.title}`);
            continue;
          }
          const id = uid();
          const names = metadataFromFilename(file.name);
          await browserDb.putAudio(db, {
            id,
            profileId: active.id,
            trackId: id,
            size: bytes.byteLength,
            sha256: hash,
            mime: classified.mime,
            blob: new Blob([bytes], { type: classified.mime }),
          });
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await browserDb.putEntry(db, entry);
          job.state = "succeeded";
          job.trackId = id;
          await browserDb.putJob(db, job);
          messages.push(`Saved offline: ${entry.title}`);
        } catch (error) {
          job.state = "failed";
          job.error = isQuotaError(error)
            ? "Not enough browser storage. Nothing was marked available offline."
            : "Import failed before the file was stored.";
          await browserDb.putJob(db, job);
          messages.push(job.error);
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

  const removeFromLibrary = useCallback(
    async (trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      await browserDb.deleteEntry(db, trackId);
      await browserDb.deleteAudio(db, trackId);
      const items = await browserDb.items(db);
      for (const item of items.filter((row) => row.trackId === trackId)) {
        await browserDb.deleteItem(db, item.id);
      }
      await reload(db, profile.id);
    },
    [profile, reload],
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
      await reload(db, active.id);
    },
    [ensureProfile, reload],
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
    [profile, reload],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const items = await browserDb.items(db);
      const target = items.find((item) => item.playlistId === playlistId && item.trackId === trackId);
      if (target) await browserDb.deleteItem(db, target.id);
      await reload(db, profile.id);
    },
    [profile, reload],
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
      await reload(db, profile.id);
    },
    [profile, reload],
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
      audioRef.current?.pause();
      await reload(db, created.id);
    },
    [reload],
  );

  const signOutLocal = useCallback(() => {
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setSnap({ entries: [], audio: [], playlists: [], items: [], backups: [], jobs: [] });
    setQueue([]);
    audioRef.current?.pause();
  }, []);

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

  const playId = useCallback(
    async (trackId: string) => {
      const db = dbRef.current;
      const element = audioRef.current;
      if (!db || !element) return;
      const row = await browserDb.getAudio(db, trackId);
      if (!row) {
        setPlayerError("This track is not available offline on this device.");
        setPlaying(false);
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(row.blob);
      urlRef.current = url;
      element.src = url;
      element.volume = volume;
      setPlayerError("");
      try {
        await element.play();
        const entry = snap.entries.find((item) => item.id === trackId);
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
        setPlayerError(error instanceof Error ? error.message : "Playback was blocked.");
      }
    },
    [snap.entries, volume],
  );

  useEffect(() => {
    const id = queue[queueIndex];
    if (!id) return;
    void playId(id);
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ ids: queue, index: queueIndex }));
  }, [queue, queueIndex, playId]);

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
    requestPersistent,
    reconcile: () => missingLocalTracks(snap.entries, localIds),
    exportManifest: () =>
      JSON.stringify(
        {
          version: 1,
          profileId: profile?.id ?? null,
          entries: snap.entries.map(({ ...entry }) => entry),
          playlists: snap.playlists,
          items: snap.items.filter((item) => snap.playlists.some((playlist) => playlist.id === item.playlistId)),
          backups: snap.backups,
        },
        null,
        2,
      ),
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
