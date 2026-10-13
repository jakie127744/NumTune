import React, { useState, useEffect, useMemo } from 'react';
import { Search, PlusCircle, Disc, Loader2, Music, Mic2 } from 'lucide-react';
import { supabase, fetchAllRows, upsertSongByYoutubeId } from '@/lib/supabase';
import { useTunrStore } from '@/lib/store';
import { toast } from '@/lib/toast';
import { roomCodeStorage } from '@/lib/roomCodeStorage';
import { extractVideoId, lookupYouTubeVideo, YouTubeVideoInfo } from '@/lib/youtube';

export const SongbookPanel: React.FC = () => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [singerInput, setSingerInput] = useState('Host');
  const [library, setLibrary] = useState<any[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  // Store actions
  const addToQueue = useTunrStore((state) => state.addToQueue);

  // Load Library on Mount
  useEffect(() => {
    const init = async () => {
        // Recover Room Code from Host session
        const savedCode = roomCodeStorage.get();
        if (savedCode) {
            useTunrStore.getState().setRoomCode(savedCode);
        }

        await fetchLibrary();
    };
    init();
  }, []);

  const fetchLibrary = async () => {
    const data = await fetchAllRows('songs', (q) => q.order('song_number', { ascending: false }));
    setLibrary(data);
  };

  // Search only the saved library. New songs come in by pasting a YouTube
  // link (YouTube search was removed - it needed a quota-limited API key).
  const libraryResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    return library.filter(s =>
        s.title.toLowerCase().includes(term) ||
        s.artist.toLowerCase().includes(term) ||
        s.song_number.toString().includes(term)
    );
  }, [searchQuery, library]);

  const handleUrlAdd = async () => {
    if (!manualUrl.trim()) return;
    const videoId = extractVideoId(manualUrl);
    if (!videoId) {
      toast.error("Invalid YouTube link. Paste a full YouTube URL (e.g. youtube.com/watch?v=...).");
      return;
    }

    setIsFetchingUrl(true);
    try {
      const video = await lookupYouTubeVideo(videoId);
      await handleQuickAdd(video);
      setManualUrl('');
    } catch (error: any) {
      console.error("URL Add Error:", error);
      toast.error(error.message);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleQuickAdd = async (video: YouTubeVideoInfo) => {
    // Check if song already exists in library (by YouTube ID)
    const existingSong = library.find(s => s.youtube_id === video.id);

    if (existingSong) {
        // Reuse existing
        addToQueue({
            id: existingSong.song_number,
            title: existingSong.title,
            artist: existingSong.artist,
            youtubeId: existingSong.youtube_id,
            duration: "00:00",
            singer: singerInput || "Host"
        }, singerInput || "Host");
        toast.success(`Song is already in library (#${existingSong.song_number})! Added to Queue for ${singerInput || "Host"}.`);
        return; 
    }

    // 1. Generate new ID
    const { data: maxIdData } = await supabase.from('songs').select('song_number').order('song_number', { ascending: false }).limit(1).single();
    const nextId = (maxIdData?.song_number || 9999) + 1;

    // oEmbed has no duration; "0:00" is the existing "unknown" value the
    // player already handles (shows --:-- instead of a progress bar).
    const formattedDuration = "0:00";

    // 2. Insert into Songs Library
    const newSong = {
      song_number: nextId,
      title: video.title,
      artist: video.author,
      youtube_id: video.id,
      thumbnail_url: video.thumbnail,
      duration: formattedDuration,
      genre: "Unknown", 
      decade: "2020s"
    };

    const { data: songData, error: songError } = await upsertSongByYoutubeId(newSong);

    if (songError || !songData) {
      console.error("Error saving song:", songError);
      toast.error("Failed to save song to library.");
      return;
    }

    // 3. Add to Queue immediately
    addToQueue({
        id: songData.song_number,
        title: songData.title,
        artist: songData.artist,
        youtubeId: songData.youtube_id,
        duration: formattedDuration,
        singer: singerInput || "Host"
    }, singerInput || "Host");

    // 4. Update local library state
    setLibrary([songData, ...library]);
    toast.success(`Added #${songData.song_number} to Library & Queue for ${singerInput || "Host"}!`);
  };

  return (
    <div className="flex flex-col h-full space-y-6">
       {/* Header */}
       <div className="flex flex-col gap-4 sticky top-0 bg-neutral-900/95 backdrop-blur-xl p-4 z-10 border-b border-white/5 -mx-2 -mt-2 rounded-t-3xl">
           <h2 className="text-2xl font-bold flex items-center gap-2">
             <Disc className="w-6 h-6 text-primary" />
             Songbook
           </h2>
           
           {/* Search Bar & Singer Input */}
           <div className="flex gap-2">
               <div className="relative w-1/3">
                    <Mic2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input 
                        className="w-full bg-black/50 border border-white/10 rounded-xl h-12 pl-10 pr-4 text-sm focus:outline-none focus:border-violet-500 transition-all font-bold text-violet-300" 
                        placeholder="Singer Name..." 
                        value={singerInput}
                        onChange={(e) => setSingerInput(e.target.value)}
                    />
               </div>
                <div className="relative flex-1">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                     <input 
                         className="w-full bg-black/50 border border-white/10 rounded-xl h-12 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-all" 
                         placeholder="Search your library..." 
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                     />
                </div>
           </div>

           {/* Add a new song by pasting its YouTube link */}
               <div className="flex gap-2 p-1.5 bg-violet-500/10 rounded-2xl border border-violet-500/20">
                    <div className="relative flex-1">
                        <Music className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400" />
                        <input
                            className="w-full bg-black/40 border border-white/5 rounded-xl h-10 pl-10 pr-4 text-xs focus:outline-none focus:border-violet-500 transition-all placeholder:text-neutral-500"
                            placeholder="Paste a YouTube link to add a new song..."
                            value={manualUrl}
                            onChange={(e) => setManualUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUrlAdd()}
                        />
                    </div>
                    <button
                        onClick={handleUrlAdd}
                        disabled={isFetchingUrl || !manualUrl}
                        className="px-6 bg-violet-600 text-white hover:bg-violet-500 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-violet-600/20"
                    >
                        {isFetchingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add Link'}
                    </button>
               </div>
       </div>

       <div className="flex-1 overflow-y-auto pr-2 space-y-8">
            {/* 1. LIBRARY RESULTS */}
            {libraryResults.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                        <Music className="w-4 h-4" /> From Library
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {libraryResults.map((song) => (
                            <div key={song.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group">
                                <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center font-bold text-xs text-neutral-500">
                                    #{song.song_number}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm truncate">{song.title}</h4>
                                    <p className="text-xs text-neutral-400 truncate">{song.artist}</p>
                                </div>
                                    <button 
                                        onClick={() => {
                                            addToQueue({
                                                id: song.song_number,
                                                title: song.title,
                                                artist: song.artist,
                                                youtubeId: song.youtube_id,
                                                duration: "00:00",
                                                singer: singerInput || "Host"
                                            }, singerInput || "Host");
                                            toast.success(`Added #${song.song_number} to Queue for ${singerInput || "Host"}!`);
                                        }}
                                        className="p-2 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-colors"
                                    >
                                        <PlusCircle className="w-5 h-5" />
                                    </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {searchQuery.trim() && libraryResults.length === 0 && (
                <div className="text-center py-20 opacity-50 text-sm">
                    <p>No songs in the library match &ldquo;{searchQuery}&rdquo;.</p>
                    <p className="mt-1">Find it on YouTube and paste the link above to add it.</p>
                </div>
            )}

            {!searchQuery && (
                <div className="text-center py-20 opacity-30">
                    <Search className="w-16 h-16 mx-auto mb-4" />
                    <p>Search your library, or paste a YouTube link above to add a new song.</p>
                </div>
            )}
       </div>
    </div>
  );
};
