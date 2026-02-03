import { StateCreator } from 'zustand';
import { TunrStore, QueueSlice, Song } from './types';
import { supabase } from '../supabase';

export const createQueueSlice: StateCreator<TunrStore, [], [], QueueSlice> = (set, get) => ({
  queue: [],
  history: [],
  roomCode: '',

  ensureSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) console.error("Auto-Auth failed:", error);
    }
  },

  generateRoomCode: async () => {
    try {
      await get().ensureSession();
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
          alert("Could not sign in anonymously. Please enable Anonymous Auth in Supabase Dashboard.");
          return "";
      }

      const code = Math.random().toString(36).substring(2, 6).toUpperCase();
      const { error: roomError } = await supabase.from('rooms').insert({
          code,
          owner_id: userId
      });

      if (roomError) {
           console.error("Failed to create room:", roomError);
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

    // @ts-ignore
    const mappedSongs: Song[] = queueData.map((item: any) => {
        if (!item.songs) return null;
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
          isPlaying: item.is_playing,
          currentPosition: item.current_position_seconds || 0,
          resetTrigger: item.reset_trigger_count || 0
        };
    }).filter(Boolean);

    const current = mappedSongs.filter(s => s.status === 'playing').pop() || null;
    const queued = mappedSongs.filter(s => s.status === 'queued');

    // SYNC GLOBAL PLAYBACK STATE
    set((state) => {
      let finalCurrent = current || null;
      
      // REFERENTIAL STABILITY CHECK
      if (state.currentSong && current && state.currentSong.id === current.id) {
           // Only preserve reference if key playback state matches.
           // If DB has updated isPlaying, we must use the new object (current).
           if (state.currentSong.isPlaying === current.isPlaying) {
               finalCurrent = state.currentSong;
           }
      }

      const newIsPlaying = finalCurrent ? !!finalCurrent.isPlaying : false;
      
      return { 
        queue: queued, 
        currentSong: finalCurrent, 
        isPlaying: newIsPlaying
      };
    });
  },

  addToQueue: async (song, singer) => {
    let songRecordId: any = null;
    const { data: existingSong, error: findError } = await supabase
        .from('songs')
        .select('id')
        .eq('song_number', song.id)
        .single();
    
    if (existingSong) {
        songRecordId = existingSong.id;
    } else {
        if (findError && findError.code !== 'PGRST116') {
             console.error("Song Lookup Error:", findError);
             alert(`Queue Failed (Song Lookup): ${findError.message}`);
             return;
        }

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
            alert(`Queue Failed (Song Register): ${regError.message}`);
            return;
        }
        songRecordId = newSong.id;
    }

    const { currentSong, roomCode } = get();
    if (!roomCode) {
        alert("Queue Failed: No Room Code active. Please refresh.");
        return;
    }

    const shouldAutoPlay = !currentSong;

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
        alert(`Queue Failed (Insert): ${insertError.message}`);
    } else {
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

  clearQueue: async () => {
    const { roomCode } = get();
    const { error } = await supabase
        .from('queue')
        .delete()
        .eq('room_code', roomCode);
    if (error) console.error("Clear queue failed:", error);
    get().fetchQueue();
  },

  moveQueueItem: async (queueId, direction) => {
    await get().ensureSession();
    const { queue } = get();
    const index = queue.findIndex(s => s.queueId === queueId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queue.length) return;

    const itemA = queue[index];
    const itemB = queue[targetIndex];

    if (!itemA.queueId || !itemB.queueId) return;

    const { data: rows, error } = await supabase
        .from('queue')
        .select('id, created_at')
        .in('id', [itemA.queueId, itemB.queueId]);

    if (error || !rows || rows.length !== 2) {
        console.error("Reorder failed: Could not fetch rows", error);
        return;
    }

    const rowA = rows.find(r => r.id === itemA.queueId);
    const rowB = rows.find(r => r.id === itemB.queueId);

    if (!rowA || !rowB) return;

    await supabase.from('queue').update({ created_at: rowB.created_at }).eq('id', itemA.queueId);
    await supabase.from('queue').update({ created_at: rowA.created_at }).eq('id', itemB.queueId);

    get().fetchQueue();
  },

  subscribeToQueue: () => {
    const { roomCode } = get();
    if (!roomCode) return;

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
          if (payload.seconds % 10 === 0) console.log("Incoming Pulse:", payload.seconds, "Playing:", payload.playing);
          window.dispatchEvent(new CustomEvent('tunr:sync', { 
            detail: { seconds: payload.seconds, timestamp: payload.timestamp, playing: payload.playing } 
          }));
      })
      .subscribe((status) => {
          console.log(`Sync Channel (${roomCode}):`, status);
      });
      
    (window as any)._activeChannel = channel;
  }
});
