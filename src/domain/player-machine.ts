export type PlayState = {
  trackId: string | null;
  position: number;
  paused: boolean;
  volume: number;
  loadGeneration: number;
};

export function initialPlayState(): PlayState {
  return { trackId: null, position: 0, paused: true, volume: 1, loadGeneration: 0 };
}

export function createLoadGate() {
  let generation = 0;
  return {
    start(): number {
      generation += 1;
      return generation;
    },
    isCurrent(ticket: number): boolean {
      return ticket === generation;
    },
  };
}

/** Only a new track selection may replace the element source. */
export function shouldReloadAudio(event: "track" | "volume" | "metadata" | "library" | "sync"): boolean {
  return event === "track";
}

export function applyVolume(state: PlayState, volume: number): PlayState {
  return { ...state, volume };
}

export function notePosition(state: PlayState, position: number, paused: boolean): PlayState {
  return { ...state, position, paused };
}

export function requestTrack(state: PlayState, trackId: string): PlayState {
  return {
    ...state,
    trackId,
    position: 0,
    paused: false,
    loadGeneration: state.loadGeneration + 1,
  };
}

export function queueIndexAfterEnd(index: number, length: number, repeat: "off" | "all" | "one"): number | null {
  if (repeat === "one") return index;
  if (index + 1 < length) return index + 1;
  if (repeat === "all" && length > 0) return 0;
  return null;
}
