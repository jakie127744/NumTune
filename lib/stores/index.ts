import { create } from 'zustand';
import { TunrStore } from './types';
import { createPlayerSlice } from './playerSlice';
import { createQueueSlice } from './queueSlice';
import { createUISlice } from './uiSlice';

export const useTunrStore = create<TunrStore>((...a) => ({
  ...createPlayerSlice(...a),
  ...createQueueSlice(...a),
  ...createUISlice(...a),
}));

export type { Song, TunrStore } from './types';
