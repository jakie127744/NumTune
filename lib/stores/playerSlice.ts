import { StateCreator } from 'zustand';
import { TunrStore, PlayerSlice } from './types';
import { supabase } from '../supabase';

export const createPlayerSlice: StateCreator<TunrStore, [], [], PlayerSlice> = (set, get) => ({
  isPlaying: false,
  currentSong: null,
  volume: 80,
  syncLatency: 0,
  syncNudge: 0,

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
        // We do strictly set playing false here to reflect "stop"
        return;
    }
    
    if (isPlaying && (!stoppedData || stoppedData.length === 0)) {
         console.error("Stop command affected 0 rows. Session mismatch.");
         alert("Session Control Lost: You are not the owner of this room (Ghost Mode). \n\nThe system will now reset to a NEW SESSION to fix this.");
         
         localStorage.removeItem('tunr_host_room_code');
         set({ isPlaying: false, currentSong: null, roomCode: "" });
         window.location.reload(); 
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
        const { data: startedData, error: startError } = await supabase
            .from('queue')
            .update({ status: 'playing', is_playing: true })
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
    await get().ensureSession(); // AUTH GUARD
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
            .update({ status: 'playing', is_playing: true, current_position_seconds: 0 })
            .eq('id', lastSongs[0].id);
            
        if (error) {
             console.error("Previous Song Error:", error);
             alert(`Play Previous Failed: ${error.message}`);
        }
    }

    get().fetchQueue();
  },

  togglePlay: async () => {
    console.log("togglePlay called. Current:", get().isPlaying);
    await get().ensureSession(); // AUTH GUARD
    const { currentSong, isPlaying } = get();
    const newStatus = !isPlaying;
    console.log("Setting isPlaying to:", newStatus);
    
    // Optimistic Update
    set(state => ({
        isPlaying: newStatus,
        currentSong: state.currentSong ? { ...state.currentSong, isPlaying: newStatus } : null
    }));

    if (currentSong?.queueId) {
        const { error } = await supabase.from('queue').update({ is_playing: newStatus }).eq('id', currentSong.queueId);
        if (error) {
            console.error("Toggle Play Update Failed:", error);
            alert(`Pause/Play Failed: ${error.message}`);
            // Revert on error
            set({ isPlaying: isPlaying });
        } else {
            console.log("DB Update Success");
        }
    }
  },

  setIsPlaying: async (active: boolean) => {
      await get().ensureSession(); // AUTH GUARD
      const { currentSong, isPlaying } = get();
      if (active === isPlaying) return; 

      set({ isPlaying: active });
      if (currentSong?.queueId) {
          const { error } = await supabase.from('queue').update({ is_playing: active }).eq('id', currentSong.queueId);
          if (error) {
             console.error("Set Play Update Failed:", error);
             alert(`Playback Warning: Failed to sync (${error.message})`);
             // Revert
             set({ isPlaying: isPlaying });
          }
      }
  },

  syncPosition: async (seconds: number) => {
    const { currentSong } = get();
    if (currentSong?.queueId) {
        // Background update does not need rigid awaiting, but errors might happen silently
        supabase
            .from('queue')
            .update({ 
                current_position_seconds: seconds,
                last_sync_at: new Date().toISOString()
            })
            .eq('id', currentSong.queueId)
            .then(); 
            
        get().broadcastSync(seconds);
    }
  },

  broadcastSync: (seconds: number) => {
    const { isPlaying } = get();
    const channel = (window as any)._activeChannel;
    // 1. Send to Network
    if (channel && channel.state === 'joined') {
        channel.send({
            type: 'broadcast',
            event: 'sync',
            payload: { seconds, playing: isPlaying, timestamp: Date.now() }
        });
    }

    // 2. Loopback Local (Zero-Latency)
    // We manually trigger this to ensure the Host UI (local) updates instantly 
    // without waiting for the network round-trip.
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
    await get().ensureSession(); // AUTH GUARD
    const { currentSong } = get();
    if (currentSong?.queueId) {
        const { data: current } = await supabase.from('queue').select('reset_trigger_count').eq('id', currentSong.queueId).single();
        const nextCount = (current?.reset_trigger_count || 0) + 1;
        await supabase.from('queue').update({ reset_trigger_count: nextCount }).eq('id', currentSong.queueId);
    }
  },

  setVolume: (val: number) => set({ volume: val }),
  setSyncNudge: (val: number) => set({ syncNudge: val }),
});
