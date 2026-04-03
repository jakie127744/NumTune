import { StateCreator } from 'zustand';
import { TunrStore, PlayerSlice } from './types';
import { supabase } from '../supabase';

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
    
    // 1. ATOMIC RESET: Stop ALL currently playing songs in THIS ROOM
    const { data: stoppedData, error: stopError } = await supabase
        .from('queue')
        .update({ status: 'history', is_playing: false })
        .eq('status', 'playing')
        .eq('room_code', roomCode)
        .select();
    
    if (stopError) {
        console.error("Error stopping playback:", stopError);
        alert(`Next Song Failed (Stop): ${stopError.message}`);
        set({ isPlaying: false });
        return;
    }
    
    if (isPlaying && (!stoppedData || stoppedData.length === 0)) {
         console.warn("Song already skipped natively by another client. Ignoring to prevent double skip.");
         return;
    }

    // 2. Find the next song
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
        alert(`Next Song Failed (Fetch): ${fetchError.message}`);
        set({ isPlaying: false }); 
        return;
    }

    if (nextRows && nextRows.length > 0) {
        const next = nextRows[0];
        
        const currentId = get().currentSong?.id;
        if (currentId && next.id === currentId) {
             console.error("Loop Detected: Next song is same as current song.");
             alert("Session Stuck: Unable to advance queue. Please click 'NEW SESSION'.");
             set({ isPlaying: false, currentSong: null });
             return;
        }

        console.log("Advancing to DB-Next:", next.songs);
        // Write timestamp-based playback state: song starts from 0, now
        const { data: startedData, error: startError } = await supabase
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
             alert(`Next Song Failed (Start): ${startError.message}`);
             set({ isPlaying: false, currentSong: null }); 
        } else if (!startedData || startedData.length === 0) {
             alert("CONTROL_ERROR: You do not own this room. Please create a NEW SESSION.");
             set({ isPlaying: false });
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
        const { error } = await supabase
            .from('queue')
            .update({ 
                status: 'playing', 
                is_playing: true, 
                current_position_seconds: 0,
                last_sync_at: new Date().toISOString()
            })
            .eq('id', lastSongs[0].id);
            
        if (error) {
             console.error("Previous Song Error:", error);
             alert(`Play Previous Failed: ${error.message}`);
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
