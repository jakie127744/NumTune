// Basic type definitions
export interface Song {
  id: number; // The numeric ID (e.g., 1042)
  queueId?: number; // Primary key in queue table
  title: string;
  artist: string;
  youtubeId: string;
  duration: string;
  singer?: string; // If queued
  status?: 'queued' | 'playing' | 'history' | 'cancelled';
  thumbnailUrl?: string;
  isPlaying?: boolean;
  currentPosition?: number;
  resetTrigger?: number;
}

// Slice Interfaces
export interface PlayerSlice {
  isPlaying: boolean;
  currentSong: Song | null;
  volume: number;
  syncLatency: number;
  syncNudge: number;

  setIsPlaying: (active: boolean) => void;
  togglePlay: () => void;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  syncPosition: (seconds: number) => Promise<void>;
  broadcastSync: (seconds: number) => void;
  onSync: (handler: (seconds: number, playing?: boolean) => void) => () => void; 
  forceReset: () => Promise<void>;
  setVolume: (val: number) => void;
  setSyncNudge: (val: number) => void;
}

export interface QueueSlice {
  queue: Song[];
  history: Song[];
  roomCode: string;

  generateRoomCode: () => Promise<string>;
  ensureSession: () => Promise<void>;
  setRoomCode: (code: string) => void;
  fetchQueue: () => Promise<void>;
  addToQueue: (song: Song, singer: string) => Promise<void>;
  removeFromQueue: (queueId: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  subscribeToQueue: () => void;
  moveQueueItem: (queueId: number, direction: 'up' | 'down') => Promise<void>;
}

export interface UISlice {
    // Placeholder for future UI state (modals, tabs)
    // Currently store.ts mixed UI into top level, but for now we'll keep strict separation
}

export type TunrStore = PlayerSlice & QueueSlice & UISlice;
