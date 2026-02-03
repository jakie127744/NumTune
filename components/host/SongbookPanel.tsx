import React, { useState, useEffect } from 'react';
import { Search, PlusCircle, Disc, Loader2, Music, CloudDownload, Edit, Trash2, Mic2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTunrStore } from '@/lib/store';

// Types for YouTube API Response
interface YouTubeSearchResult {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      high: { url: string };
      medium: { url: string };
    };
  };
  contentDetails?: {
      duration: string;
  };
}

export const SongbookPanel: React.FC = () => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [singerInput, setSingerInput] = useState('Host');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [libraryResults, setLibraryResults] = useState<any[]>([]); 
  const [isSearching, setIsSearching] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [library, setLibrary] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Store actions
  const addToQueue = useTunrStore((state) => state.addToQueue);

  // Load Library & Default Recommendations on Mount
  useEffect(() => {
    fetchLibrary();
    performSearch("Popular Karaoke Songs");
  }, []);

  const fetchLibrary = async () => {
    const { data } = await supabase.from('songs').select('*').order('song_number', { ascending: false });
    if (data) setLibrary(data);
  };

  const parseDuration = (duration: string) => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
  };

  // Debounce Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
        setLibraryResults([]);
        setSearchError(null);
      }
    }, 500); 

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const performSearch = async (term: string) => {
    if (!term.trim()) return;
    setIsSearching(true);
    setSearchError(null); 
    
    // 1. Local Library Search
    const lowerTerm = term.toLowerCase();
    const localMatches = library.filter(s => 
        s.title.toLowerCase().includes(lowerTerm) || 
        s.artist.toLowerCase().includes(lowerTerm) ||
        s.song_number.toString().includes(lowerTerm)
    );
    setLibraryResults(localMatches);

    // 2. YouTube Search
    try {
      const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
      
      const SOURCES = [
          "Atomic Karaoke", "PROmusicCOVER", "CoversPH", "Singstar Karaoke",
          "Top Hits Karaoke", "Sing King Karaoke", "Karaokey TV", 
          "Pinoy Videoke Tambayan", "Mibalmz Karaoke"
      ];
      
      const selectedSource = SOURCES[Math.floor(Math.random() * SOURCES.length)];
      
      const cleanTerm = term.toLowerCase().includes('karaoke') 
          ? term 
          : `${term} ${selectedSource}`;
      
      const query = encodeURIComponent(cleanTerm);
      
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=20&q=${query}&key=${API_KEY}`
      );
      const searchData = await searchRes.json();
      
      if (searchData.error) {
          console.error("YouTube API Error:", searchData.error);
          setSearchError(`YouTube API Error: ${searchData.error.message}`);
          setSearchResults([]);
          return;
      }
      
      if (!searchData.items?.length) {
        setSearchResults([]);
        return;
      }

      const videoIds = searchData.items
        .filter((item: any) => item.id.kind === 'youtube#video')
        .map((item: any) => item.id.videoId)
        .join(',');

      if (!videoIds) {
          setSearchResults([]);
          setIsSearching(false);
          return;
      }

      const videoRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${API_KEY}`
      );
      const videoData = await videoRes.json();

      const filtered = videoData.items.filter((video: any) => {
        const durationSec = parseDuration(video.contentDetails.duration);
        return durationSec <= 600 && durationSec >= 30; // 30s to 10m
      });

      setSearchResults(filtered);

    } catch (error) {
      console.error("YouTube Search Error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickAdd = async (video: YouTubeSearchResult) => {
    const existingSong = library.find(s => s.youtube_id === video.id);

    if (existingSong) {
        addToQueue({
            id: existingSong.song_number,
            title: existingSong.title,
            artist: existingSong.artist,
            youtubeId: existingSong.youtube_id,
            duration: "00:00",
            singer: singerInput || "Host"
        }, singerInput || "Host");
        alert(`Song is already in library (#${existingSong.song_number})! Added to Queue for ${singerInput || "Host"}.`);
        return; 
    }

    const { data: maxIdData } = await supabase.from('songs').select('song_number').order('song_number', { ascending: false }).limit(1).single();
    const nextId = (maxIdData?.song_number || 9999) + 1;

    const formatDuration = (isoDuration: string) => {
        const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        if (!match) return "0:00";
        const h = parseInt(match[1] || '0');
        const m = parseInt(match[2] || '0');
        const s = parseInt(match[3] || '0');
        
        let totalM = (h * 60) + m;
        return `${totalM}:${s.toString().padStart(2, '0')}`;
    };

    const formattedDuration = video.contentDetails ? formatDuration(video.contentDetails.duration) : "0:00";

    const newSong = {
      song_number: nextId,
      title: video.snippet.title,
      artist: video.snippet.channelTitle,
      youtube_id: video.id,
      thumbnail_url: video.snippet.thumbnails.high.url,
      duration: formattedDuration,
      genre: "Unknown", 
      decade: "2020s"
    };

    const { data: songData, error: songError } = await supabase.from('songs').insert([newSong]).select().single();

    if (songError) {
      console.error("Error saving song:", songError);
      alert("Failed to save song to library.");
      return;
    }

    addToQueue({
        id: newSong.song_number,
        title: newSong.title,
        artist: newSong.artist,
        youtubeId: newSong.youtube_id,
        duration: formattedDuration,
        singer: singerInput || "Host"
    }, singerInput || "Host");
    
    setLibrary([songData, ...library]);
    alert(`Added #${nextId} to Library & Queue for ${singerInput || "Host"}!`);
  };

  const seedLibrary = async () => {
    setIsSeeding(true);
    let songsToInsert: any[] = [];
    
    try {
        const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
        const SOURCES = ["Atomic Karaoke", "PROmusicCOVER", "CoversPH", "Singstar Karaoke"];
        const selectedSource = SOURCES[Math.floor(Math.random() * SOURCES.length)];

        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=50&q=${encodeURIComponent(selectedSource)}&order=viewCount&key=${API_KEY}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error.message); 
        if (!data.items?.length) throw new Error("No songs found");

        const videoIds = data.items.map((i:any) => i.id.videoId).join(',');
        const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${API_KEY}`);
        const detailsData = await detailsRes.json();

        songsToInsert = detailsData.items.map((v:any) => ({
            title: v.snippet.title,
            artist: v.snippet.channelTitle,
            youtube_id: v.id,
            thumbnail_url: v.snippet.thumbnails?.high?.url || "",
            genre: "Pop",
            decade: "2020s"
        }));

    } catch (e: any) {
        console.warn("Seeding failed", e);
    }

    // Insert logic... (Simplified for this component version)
    // We can assume seeding is a rare admin task, primarily we want SEARCH.
    // ...
    setIsSeeding(false);
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
                        className="w-full bg-black/50 border border-white/10 rounded-xl max-w-full h-12 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-all" 
                        placeholder="Search Artist, Title, or YouTube..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {isSearching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
               </div>
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
                                            alert(`Added #${song.song_number} to Queue for ${singerInput || "Host"}!`);
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

            {/* 2. YOUTUBE RESULTS */}
            {searchResults.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                        <Disc className="w-4 h-4 text-red-500" /> New from YouTube
                    </h3>
                     {searchError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-xs">
                            {searchError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {searchResults.map((video) => (
                            <div key={video.id} className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all">
                                <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                                    <img src={video.snippet.thumbnails.medium.url} className="w-full h-full object-cover opacity-80" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm line-clamp-1" dangerouslySetInnerHTML={{ __html: video.snippet.title }} />
                                    <p className="text-xs text-neutral-400 truncate">{video.snippet.channelTitle}</p>
                                </div>
                                <button 
                                    onClick={() => handleQuickAdd(video)}
                                    className="w-full py-2 bg-primary/20 hover:bg-primary text-primary hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    <PlusCircle className="w-4 h-4" /> Save & Queue
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {!searchQuery && (
                <div className="text-center py-20 opacity-30">
                    <Search className="w-16 h-16 mx-auto mb-4" />
                    <p>Search for songs to add...</p>
                </div>
            )}
       </div>
    </div>
  );
};
