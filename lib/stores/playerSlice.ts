import { StateCreator } from 'zustand';
import { TunrStore, PlayerSlice } from './types';
import { supabase } from '../supabase';
import { toast } from '../toast';

export const createPlayerSlice: StateCreator<TunrStore, [], [], PlayerSlice> = (set, get) => ({
  isPlaying: false,
  isHost: false,
  currentSong: null,
  volume: 80,
  syncLatency: 0,
  syncNudge: 0,
  hostAudioMuted: false,

  playNext: async () => {
    await get().ensureSession();

    const { roomCode, isPlaying } = get();

    // Atomic stop-current + start-next, done server-side in one transaction
    // to avoid the race where two callers (e.g. Stage's auto-end timer and a
    // manual host skip) both observe a "clean" intermediate state and each
    // advance the queue, double-skipping a singer.
    const { data, error } = await supabase.rpc('advance_queue', { p_room_code: roomCode });

    // RPC requires migration_advance_queue_rpc.sql; degrade to the old
    // two-step (non-atomic) logic if that migration hasn't been run yet,
    // rather than leaving Skip completely broken.
    if (error?.code === 'PGRST202' || error?.message?.includes('Could not find the function')) {
        console.warn('advance_queue RPC not found (run migration_advance_queue_rpc.sql) - falling back to legacy two-step skip.');
        return get().playNextLegacy();
    }

    if (error) {
        console.error("Error advancing queue:", error);
        if (error.message?.includes('CONTROL_ERROR')) {
            toast.error("You do not own this room. Please create a NEW SESSION.");
        } else {
            toast.error(`Next Song Failed: ${error.message}`);
        }
        set({ isPlaying: false });
        return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const stoppedCount = result?.stopped_count ?? 0;
    const nextQueueId = result?.next_queue_id ?? null;

    if (isPlaying && stoppedCount === 0 && nextQueueId === null) {
         console.warn("Song already skipped natively by another client. Ignoring to prevent double skip.");
         return;
    }

    if (nextQueueId === null) {
        console.log("Queue empty in DB. Stopping.");
        set({ currentSong: null, isPlaying: false });
    }

    get().fetchQueue();
  },

  // Legacy fallback used only when migration_advance_queue_rpc.sql hasn't been
  // applied yet. Not atomic - kept solely so Skip doesn't fully break pre-migration.
  playNextLegacy: async () => {
    const { roomCode, isPlaying } = get();

    const { data: stoppedData, error: stopError } = await supabase
        .from('queue')
        .update({ status: 'history', is_playing: false })
        .eq('status', 'playing')
        .eq('room_code', roomCode)
        .select();

    if (stopError) {
        console.error("Error stopping playback:", stopError);
        toast.error(`Next Song Failed (Stop): ${stopError.message}`);
        set({ isPlaying: false });
        return;
    }

    if (isPlaying && (!stoppedData || stoppedData.length === 0)) {
         console.warn("Song already skipped natively by another client. Ignoring to prevent double skip.");
         return;
    }

    const { data: nextRows, error: fetchError } = await supabase
        .from('queue')
        .select('id, songs(title)')
        .eq('status', 'queued')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1);

    if (fetchError) {
        console.error("Error fetching next:", fetchError);
        toast.error(`Next Song Failed (Fetch): ${fetchError.message}`);
        set({ isPlaying: false });
        return;
    }

    if (nextRows && nextRows.length > 0) {
        const next = nextRows[0];
        const { error: startError } = await supabase
            .from('queue')
            .update({
                status: 'playing',
                is_playing: true,
                current_position_seconds: 0,
                last_sync_at: new Date().toISOString()
            })
            .eq('id', next.id)
            .select();

        if (startError) {
             console.error("Error starting next:", startError);
             toast.error(`Next Song Failed (Start): ${startError.message}`);
             set({ isPlaying: false, currentSong: null });
        }
    } else {
        console.log("Queue empty in DB. Stopping.");
        set({ currentSong: null, isPlaying: false });
    }

    get().fetchQueue();
  },

  playPrevious: async () => {
    await get().ensureSession();
    const { roomCode, currentSong } = get();
    if (!roomCode) return;

    if (currentSong?.queueId) {
        await supabase
            .from('queue')
            .update({ status: 'queued', is_playing: false, current_position_seconds: 0 })
            .eq('id', currentSong.queueId);
    }

    const { data: lastSongs } = await supabase
        .from('queue')
        .select('id')
        .eq('status', 'history')
        .eq('room_code', roomCode)
        .order('updated_at', { ascending: false })
        .limit(1);

    if (lastSongs && lastSongs.length > 0) {
        // Bump reset_trigger_count so Stage/Host preview seek to 0 even if
        // their drift-correction interval hasn't fired yet - mirrors forceReset().
        const { data: prevRow } = await supabase.from('queue').select('reset_trigger_count').eq('id', lastSongs[0].id).single();
        const nextResetCount = (prevRow?.reset_trigger_count || 0) + 1;

        const { error } = await supabase
            .from('queue')
            .update({
                status: 'playing',
                is_playing: true,
                current_position_seconds: 0,
                last_sync_at: new Date().toISOString(),
                reset_trigger_count: nextResetCount
            })
            .eq('id', lastSongs[0].id);

        if (error) {
             console.error("Previous Song Error:", error);
             toast.error(`Play Previous Failed: ${error.message}`);
        }
    }

    get().fetchQueue();
  },

  setLocalIsPlaying: (active: boolean) => {
    set(state => ({
        isPlaying: active,
        currentSong: state.currentSong ? { ...state.currentSong, isPlaying: active } : null
    }));
  },

  togglePlay: () => {
      const { isPlaying } = get();
      get().setIsPlaying(!isPlaying);
  },

  setIsPlaying: async (active: boolean) => {
      // Local state update always happens immediately for UI responsiveness
      get().setLocalIsPlaying(active);

      // PERSISTENT DB Checkpoint: Only Authority (Host) writes to DB
      if (!get().isHost) return;

      await get().ensureSession();
      const { currentSong } = get();
      if (currentSong?.queueId) {
          const elapsed = (window as any).__hostElapsed || 0;
          await supabase
              .from('queue')
              .update({ 
                  is_playing: active,
                  current_position_seconds: Math.floor(elapsed),
                  last_sync_at: new Date().toISOString()
              })
              .eq('id', currentSong.queueId);
      }
  },

  syncPosition: async (seconds: number) => {
    // Store elapsed on window for setIsPlaying to read
    (window as any).__hostElapsed = seconds;
    get().broadcastSync(seconds);
  },

  broadcastSync: (seconds: number) => {
    const { isPlaying } = get();
    const channel = (window as any)._activeChannel;
    if (channel && channel.state === 'joined') {
        channel.send({
            type: 'broadcast',
            event: 'sync',
            payload: { seconds, playing: isPlaying, timestamp: Date.now() }
        });
    }
    window.dispatchEvent(new CustomEvent('tunr:sync', { 
        detail: { seconds, playing: isPlaying, timestamp: Date.now() } 
    }));
  },

  onSync: (handler: (seconds: number, playing?: boolean) => void) => {
      const listener = (e: any) => {
          const { seconds, timestamp, playing } = e.detail;
          if (timestamp) {
              const latency = Date.now() - timestamp;
              if (latency > -5000 && latency < 5000) {
                set({ syncLatency: latency });
              }
          }
          handler(seconds, playing);
      };
      window.addEventListener('tunr:sync', listener);
      return () => window.removeEventListener('tunr:sync', listener);
  },

  forceReset: async () => {
    await get().ensureSession();
    const { currentSong } = get();
    if (currentSong?.queueId) {
        const { data: current } = await supabase.from('queue').select('reset_trigger_count').eq('id', currentSong.queueId).single();
        const nextCount = (current?.reset_trigger_count || 0) + 1;
        await supabase.from('queue').update({ reset_trigger_count: nextCount }).eq('id', currentSong.queueId);
    }
  },

  setVolume: (val: number) => set({ volume: val }),
  setSyncNudge: (val: number) => set({ syncNudge: val }),
  setHostAudioMuted: (muted: boolean) => set({ hostAudioMuted: muted }),
});
