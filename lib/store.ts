
import { create } from 'zustand';
import { supabase } from './supabase';

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

interface TunrStore {
  // State
  queue: Song[];
  history: Song[];
  isPlaying: boolean;
  currentSong: Song | null;
  volume: number;
  roomCode: string;
  syncLatency: number; 
  syncNudge: number; // For manual alignment
  
  // Actions
  generateRoomCode: () => Promise<string>;
  ensureSession: () => Promise<void>;
  setRoomCode: (code: string) => void;
  fetchQueue: () => Promise<void>;
  addToQueue: (song: Song, singer: string) => Promise<void>;
  removeFromQueue: (queueId: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  togglePlay: () => void;
  setIsPlaying: (active: boolean) => void;
  syncPosition: (seconds: number) => Promise<void>;
  broadcastSync: (seconds: number) => void;
  onSync: (handler: (seconds: number, playing?: boolean) => void) => () => void; // Returns unsubscribe
  forceReset: () => Promise<void>;
  setSyncNudge: (val: number) => void;
  clearQueue: () => Promise<void>;
  setVolume: (val: number) => void;
  subscribeToQueue: () => void;
}

export const useTunrStore = create<TunrStore>((set, get) => ({
  queue: [],
  history: [],
  isPlaying: false,
  currentSong: null,
  volume: 80,
  roomCode: '',
  syncLatency: 0,
  syncNudge: 0,

  ensureSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) console.error("Auto-Auth failed:", error);
    }
  },

  generateRoomCode: async () => {
    try {
      // 1. Authenticate Host (Anonymous)
      await get().ensureSession();
      
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
          alert("Could not sign in anonymously. Please enable Anonymous Auth in Supabase Dashboard.");
          return "";
      }

      // 2. Generate and Register Room
      const code = Math.random().toString(36).substring(2, 6).toUpperCase();
      
      const { error: roomError } = await supabase.from('rooms').insert({
          code,
          owner_id: userId
      });

      if (roomError) {
           console.error("Failed to create room:", roomError);
           // Fallback: If code exists, try again (simple recursive retry could work, but let's just fail safe)
           return "";
      }

      set({ roomCode: code });
      return code;
    } catch (e) {
      console.error("Room generation logic error:", e);
      return "";
    }
  },

  setRoomCode: (code: string) => set({ roomCode: code.toUpperCase() }),

  fetchQueue: async () => {
    const { roomCode } = get();
    if (!roomCode) return;
    // Join queue with songs table and filter by roomCode
    const { data: queueData, error } = await supabase
      .from('queue')
      .select(`
        id,
        singer_name,
        status,
        is_playing,
        room_code,
        created_at,
        current_position_seconds,
        reset_trigger_count,
        songs (
          song_number,
          title,
          artist,
          youtube_id,
          duration,
          thumbnail_url
        )
      `)
      .in('status', ['queued', 'playing'])
      .eq('room_code', roomCode)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching queue:', error);
      return;
    }

    // Map to local Song object
    // @ts-ignore
    const mappedSongs: Song[] = queueData.map((item: any) => {
        if (!item.songs) return null; // Safety check
        return {
          id: item.songs.song_number,
          queueId: item.id,
          title: item.songs.title,
          artist: item.songs.artist,
          youtubeId: item.songs.youtube_id,
          duration: item.songs.duration || "0:00",
          singer: item.singer_name,
          status: item.status,
          thumbnailUrl: item.songs.thumbnail_url,
          isPlaying: item.is_playing, // Sync from DB
          currentPosition: item.current_position_seconds || 0,
          resetTrigger: item.reset_trigger_count || 0
        };
    }).filter(Boolean);

    const current = mappedSongs.find(s => s.status === 'playing') || null;
    const queued = mappedSongs.filter(s => s.status === 'queued');

    // SYNC GLOBAL PLAYBACK STATE
    set((state) => {
      // Avoid overwriting isPlaying if it was just state-toggled locally
      const syncNeeded = !state.currentSong || state.currentSong.id !== current?.id;
      return { 
        queue: queued, 
        currentSong: current || (queued.length > 0 ? state.currentSong : null), 
        isPlaying: current ? !!current.isPlaying : false
      };
    });
  },

  addToQueue: async (song, singer) => {
    // 1. Check if we need to look up the UUID/ID from the songs table if we only have song_number
    // Assuming song.id corresponds to song_number based on previous context
    
    // Find or Create the song record
    let songRecordId: any = null;
    const { data: existingSong } = await supabase
        .from('songs')
        .select('id')
        .eq('song_number', song.id)
        .single();
    
    if (existingSong) {
        songRecordId = existingSong.id;
    } else {
        // Auto-register the song into the library
        const { data: newSong, error: regError } = await supabase
            .from('songs')
            .insert({
                song_number: song.id,
                title: song.title,
                artist: song.artist,
                youtube_id: song.youtubeId || "",
                thumbnail_url: song.thumbnailUrl || ""
            })
            .select('id')
            .single();
        
        if (regError) {
            console.error("Failed to auto-register song:", regError);
            return;
        }
        songRecordId = newSong.id;
    }

    // 2. Check if anything is playing
    const { currentSong } = get();
    // We can't trust local state for "Next", but for "Auto-Play on Add" it's tricky.
    // Better to just insert as queued, then let the Host (or user) start it?
    // Or check DB for 'playing' status count?
    // For now, keep existing optimistic check but improve robustness later.
    const shouldAutoPlay = !currentSong;

    const { roomCode } = get();

    // 3. Insert into Queue
    const { error: insertError } = await supabase
        .from('queue')
        .insert({
            song_id: songRecordId,
            singer_name: singer,
            status: shouldAutoPlay ? 'playing' : 'queued',
            is_playing: shouldAutoPlay,
            room_code: roomCode
        });

    if (insertError) {
        console.error("Failed to queue:", insertError);
        alert(`Queue Failed: ${insertError.message}`);
    } else {
        // Refresh
        get().fetchQueue();
    }
  },

  removeFromQueue: async (queueId) => {
    const { error } = await supabase.from('queue').delete().eq('id', queueId);
    if (error) {
        console.error("Delete failed:", error);
        alert("Failed to delete! Check database policies.");
    }
    get().fetchQueue();
  },

  playNext: async () => {
    const { roomCode } = get();
    // 1. ATOMIC RESET: Stop ALL currently playing songs in THIS ROOM
    const { error: stopError } = await supabase
        .from('queue')
        .update({ status: 'history', is_playing: false })
        .eq('status', 'playing')
        .eq('room_code', roomCode);
    
    if (stopError) console.error("Error stopping playback:", stopError);

    // 2. Find the next song in line (Oldest 'queued' in THIS ROOM)
    const { data: nextRows } = await supabase
        .from('queue')
        .select('id, songs(title)')
        .eq('status', 'queued')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }) // Deterministic
        .limit(1);

    if (nextRows && nextRows.length > 0) {
        const next = nextRows[0];
        console.log("Advancing to DB-Next:", next.songs);
        await supabase.from('queue').update({ status: 'playing', is_playing: true }).eq('id', next.id);
    } else {
        console.log("Queue empty in DB. Stopping.");
        set({ currentSong: null, isPlaying: false });
    }

    // 3. Refresh Local State
    get().fetchQueue();
  },

  playPrevious: async () => {
    const { roomCode, currentSong } = get();
    if (!roomCode) return;

    // 1. Move currently playing song back to 'queued' if it exists
    if (currentSong?.queueId) {
        await supabase
            .from('queue')
            .update({ status: 'queued', is_playing: false, current_position_seconds: 0 })
            .eq('id', currentSong.queueId);
    }

    // 2. Find the most recent 'history' song
    const { data: lastSongs } = await supabase
        .from('queue')
        .select('id')
        .eq('status', 'history')
        .eq('room_code', roomCode)
        .order('updated_at', { ascending: false }) // updated_at tracks when it moved to history
        .limit(1);

    if (lastSongs && lastSongs.length > 0) {
        // 3. Bring it back to life
        await supabase
            .from('queue')
            .update({ status: 'playing', is_playing: true, current_position_seconds: 0 })
            .eq('id', lastSongs[0].id);
    }

    get().fetchQueue();
  },

  subscribeToQueue: () => {
    const { roomCode } = get();
    if (!roomCode) return;

    // 1. Cleanup existing channels to prevent memory leaks and duplicate messages
    if ((window as any)._activeChannel) {
        supabase.removeChannel((window as any)._activeChannel);
    }
    
    const channel = supabase.channel(`room-sync:${roomCode}`, {
        config: {
            broadcast: { self: true, ack: false }
        }
    });
    
    channel
      .on('postgres_changes', { 
         event: '*', 
         schema: 'public', 
         table: 'queue',
         filter: `room_code=eq.${roomCode}` 
      }, (payload) => {
        console.log("Realtime DB Change:", payload);
        get().fetchQueue();
      })
      .on('broadcast', { event: 'sync' }, ({ payload }) => {
          // Instant sync message
          if (payload.seconds % 10 === 0) console.log("Incoming Pulse:", payload.seconds, "Playing:", payload.playing);
          window.dispatchEvent(new CustomEvent('tunr:sync', { 
            detail: { seconds: payload.seconds, timestamp: payload.timestamp, playing: payload.playing } 
          }));
      })
      .subscribe((status) => {
          console.log(`Sync Channel (${roomCode}):`, status);
      });
      
    (window as any)._activeChannel = channel;
  },

  togglePlay: async () => {
    const { currentSong, isPlaying } = get();
    const newStatus = !isPlaying;
    
    // Optimistic Update
    set({ isPlaying: newStatus });

    if (currentSong?.queueId) {
        await supabase.from('queue').update({ is_playing: newStatus }).eq('id', currentSong.queueId);
    }
  },

  setIsPlaying: async (active: boolean) => {
      const { currentSong, isPlaying } = get();
      if (active === isPlaying) return; // No change

      set({ isPlaying: active });
      if (currentSong?.queueId) {
          await supabase.from('queue').update({ is_playing: active }).eq('id', currentSong.queueId);
      }
  },

  syncPosition: async (seconds: number) => {
    const { currentSong } = get();
    if (currentSong?.queueId) {
        // 1. Slow DB update for history/reloads
        supabase
            .from('queue')
            .update({ 
                current_position_seconds: seconds,
                last_sync_at: new Date().toISOString()
            })
            .eq('id', currentSong.queueId)
            .then(); // Background it
            
        // 2. High Speed Broadcast
        get().broadcastSync(seconds);
    }
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
  },

  onSync: (handler: (seconds: number, playing?: boolean) => void) => {
      const listener = (e: any) => {
          const { seconds, timestamp, playing } = e.detail;
          if (timestamp) {
              const latency = Date.now() - timestamp;
              // Only update syncLatency if timestamp is present and latency is within a reasonable range (e.g., -5s to +5s)
              // to avoid issues with wildly different client clocks.
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
    const { currentSong } = get();
    if (currentSong?.queueId) {
        const { data: current } = await supabase.from('queue').select('reset_trigger_count').eq('id', currentSong.queueId).single();
        const nextCount = (current?.reset_trigger_count || 0) + 1;
        await supabase.from('queue').update({ reset_trigger_count: nextCount }).eq('id', currentSong.queueId);
    }
  },

  clearQueue: async () => {
    const { roomCode } = get();
    const { error } = await supabase
        .from('queue')
        .delete()
        .eq('room_code', roomCode); // Delete only this room's queue
    if (error) console.error("Clear queue failed:", error);
    get().fetchQueue();
  },

  setVolume: (val: number) => set({ volume: val }),
  setSyncNudge: (val: number) => set({ syncNudge: val }),
}));
