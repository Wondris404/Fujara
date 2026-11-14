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
import { adoptManifest, localLibraryManifest, parseManifest } from "@/domain/manifest";
import { availabilityFor, availabilityLabels } from "@/domain/labels";
import { classifyAudioFile, isQuotaError, metadataFromFilename } from "@/domain/import-policy";
import { planImport } from "@/domain/import-flow";
import { createLoadGate, shouldReloadAudio } from "@/domain/player-machine";
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
      await browserDb.putEntry(db, {
        ...current,
        title: title.trim() || current.title,
        artist: artist.trim() || current.artist,
        userEdited: true,
        version: (current.version ?? 1) + 1,
        updatedAt: new Date().toISOString(),
      });
      await reload(db, profile.id);
    },
    [profile, reload],
  );

  const toggleFavorite = useCallback(
    async (trackId: string) => {
      const db = dbRef.current;
      if (!db || !profile) return;
      const current = (await browserDb.entries(db)).find((row) => row.id === trackId && row.profileId === profile.id);
      if (!current) return;
      await browserDb.putEntry(db, { ...current, favorite: !current.favorite, version: (current.version ?? 1) + 1, updatedAt: new Date().toISOString() });
      await reload(db, profile.id);
    },
    [profile, reload],
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
