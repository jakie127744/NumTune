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
          alert("Could not initialize session auth.");
          return "";
      }

      // If user is authenticated genuinely, try to recover their existing room
      if (!session?.user?.is_anonymous) {
          const { data: existingRoom } = await supabase.from('rooms').select('code').eq('owner_id', userId).order('created_at', { ascending: false }).limit(1).single();
          if (existingRoom) {
              set({ roomCode: existingRoom.code });
              return existingRoom.code;
          }
      }

      // Retry on room-code collision (unique constraint on rooms.code) instead
      // of leaving the host stuck with no room at all.
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const code = Math.random().toString(36).substring(2, 6).toUpperCase();
          const { error: roomError } = await supabase.from('rooms').insert({
              code,
              owner_id: userId
          });

          if (!roomError) {
              set({ roomCode: code });
              if (typeof window !== 'undefined') {
                  localStorage.setItem('tunr_host_room_code', code);
              }
              return code;
          }

          // Only retry on a uniqueness conflict; anything else is a real failure.
          if (roomError.code !== '23505') {
              console.error("Failed to create room:", roomError);
              return "";
          }
          console.warn(`Room code collision (attempt ${attempt + 1}/${maxAttempts}), retrying...`);
      }

      console.error("Failed to create room: exhausted retries on code collisions");
      return "";
    } catch (e) {
      console.error("Room generation logic error:", e);
      return "";
    }
  },

  setRoomCode: (code: string) => {
    const upperCode = code.toUpperCase();
    set({ roomCode: upperCode });
    if (typeof window !== 'undefined') {
        localStorage.setItem('tunr_host_room_code', upperCode);
    }
  },

  fetchQueue: async () => {
    const { roomCode } = get();
    if (!roomCode) return;

    const baseSelect = `
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
      `;

    // Prefer ordering by the dedicated position column (see migration_queue_position.sql).
    // Falls back to the old created_at/id ordering if that migration hasn't been run yet,
    // so the queue keeps working either way instead of failing outright.
    let { data: queueData, error } = await supabase
      .from('queue')
      .select(`position, ${baseSelect}`)
      .in('status', ['queued', 'playing'])
      .eq('room_code', roomCode)
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error?.code === '42703' && error.message?.includes('position')) {
      console.warn('queue.position column not found yet (run migration_queue_position.sql) - falling back to created_at ordering.');
      const fallback = await supabase
        .from('queue')
        .select(baseSelect)
        .in('status', ['queued', 'playing'])
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      queueData = fallback.data as any;
      error = fallback.error;
    }

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
               // Preserve the reference BUT always pull the latest position and
               // reset-trigger count from DB, so newly-opened Stage clients get
               // the real host timestamp and "Force Resync" isn't silently
               // dropped just because isPlaying didn't also change this tick.
               finalCurrent = {
                   ...state.currentSong,
                   currentPosition: current.currentPosition,
                   resetTrigger: current.resetTrigger
               };
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
    const { data: existingSongData, error: findError } = await supabase
        .from('songs')
        .select('id')
        .eq('song_number', song.id)
        .limit(1);
    
    if (existingSongData && existingSongData.length > 0) {
        songRecordId = existingSongData[0].id;
    } else {
        if (findError) {
             console.error("Song Lookup Error:", findError);
             alert(`Queue Failed (Song Lookup): ${findError.message}`);
             return;
        }

        const { data: newSongData, error: regError } = await supabase
            .from('songs')
            .insert({
                song_number: song.id,
                title: song.title,
                artist: song.artist,
                youtube_id: song.youtubeId || "",
                thumbnail_url: song.thumbnailUrl || ""
            })
            .select('id');
        
        if (regError || !newSongData || newSongData.length === 0) {
            console.error("Failed to auto-register song:", regError);
            alert(`Queue Failed (Song Register): ${regError?.message || 'No data returned'}`);
            return;
        }
        songRecordId = newSongData[0].id;
    }

    const { currentSong, roomCode } = get();
    if (!roomCode) {
        alert("Queue Failed: No Room Code active. Please refresh.");
        return;
    }

    const shouldAutoPlay = !currentSong;

    // position column requires migration_queue_position.sql; degrade gracefully if absent.
    const { data: maxPosRow, error: maxPosError } = await supabase
        .from('queue')
        .select('position')
        .eq('room_code', roomCode)
        .order('position', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
    const positionColumnExists = !maxPosError;
    const nextPosition = (maxPosRow?.position || 0) + 1;

    const insertPayload: any = {
        song_id: songRecordId,
        singer_name: singer,
        status: shouldAutoPlay ? 'playing' : 'queued',
        is_playing: shouldAutoPlay,
        room_code: roomCode
    };
    if (positionColumnExists) insertPayload.position = nextPosition;

    const { error: insertError } = await supabase
        .from('queue')
        .insert(insertPayload);

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

    // position column requires migration_queue_position.sql; degrade to the
    // old created_at-swap behavior if that migration hasn't been run yet.
    let { data: rows, error } = await supabase
        .from('queue')
        .select('id, position, created_at')
        .in('id', [itemA.queueId, itemB.queueId]);

    let positionColumnExists = true;
    if (error?.code === '42703' && error.message?.includes('position')) {
        positionColumnExists = false;
        const fallback = await supabase
            .from('queue')
            .select('id, created_at')
            .in('id', [itemA.queueId, itemB.queueId]);
        rows = fallback.data as any;
        error = fallback.error;
    }

    if (error || !rows || rows.length !== 2) {
        console.error("Reorder failed: Could not fetch rows", error);
        return;
    }

    const rowA = rows.find(r => r.id === itemA.queueId);
    const rowB = rows.find(r => r.id === itemB.queueId);

    if (!rowA || !rowB) return;

    if (positionColumnExists) {
        const posA = (rowA as any).position ?? new Date(rowA.created_at).getTime();
        const posB = (rowB as any).position ?? new Date(rowB.created_at).getTime();
        await supabase.from('queue').update({ position: posB }).eq('id', itemA.queueId);
        await supabase.from('queue').update({ position: posA }).eq('id', itemB.queueId);
    } else {
        await supabase.from('queue').update({ created_at: rowB.created_at }).eq('id', itemA.queueId);
        await supabase.from('queue').update({ created_at: rowA.created_at }).eq('id', itemB.queueId);
    }

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
