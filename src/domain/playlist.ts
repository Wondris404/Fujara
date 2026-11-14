import type { PlaylistItem } from "./types";

export function orderedItems(items: PlaylistItem[], playlistId: string): PlaylistItem[] {
  return items
    .filter((item) => item.playlistId === playlistId)
    .slice()
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function reorderItems(items: PlaylistItem[], playlistId: string, trackIds: string[]): PlaylistItem[] {
  const others = items.filter((item) => item.playlistId !== playlistId);
  const current = orderedItems(items, playlistId);
  const byTrack = new Map(current.map((item) => [item.trackId, item]));
  const next: PlaylistItem[] = [];
  trackIds.forEach((trackId, index) => {
    const existing = byTrack.get(trackId);
    if (!existing) return;
    next.push({ ...existing, position: index });
    byTrack.delete(trackId);
  });
  return [...others, ...next];
}

export function moveItem(items: PlaylistItem[], playlistId: string, trackId: string, direction: -1 | 1): PlaylistItem[] {
  const ordered = orderedItems(items, playlistId);
  const index = ordered.findIndex((item) => item.trackId === trackId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return items;
  const ids = ordered.map((item) => item.trackId);
  const [removed] = ids.splice(index, 1);
  ids.splice(target, 0, removed);
  return reorderItems(items, playlistId, ids);
}
