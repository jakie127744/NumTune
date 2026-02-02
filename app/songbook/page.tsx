'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, PlusCircle, Edit, Trash2, Disc, Loader2, Music, Mic2, CloudDownload } from 'lucide-react';
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



export default function SongbookPage() {
  // State
  const [searchQuery, setSearchQuery] = useState('');
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
    // Start with a generic search effectively
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
      
      // Curated List of Sources
      const SOURCES = [
          "Atomic Karaoke",
          "PROmusicCOVER",
          "CoversPH",
          "Singstar Karaoke",
          "Top Hits Karaoke",
          "Sing King Karaoke",
          "Karaokey TV", 
          "Pinoy Videoke Tambayan",
          "Mibalmz Karaoke"
      ];
      
      // If "Popular" or generic search, pick random. Otherwise, try to be smart or just search universally.
      // But user wants specific channels. We'll append one randomly to keep variety high.
      const selectedSource = SOURCES[Math.floor(Math.random() * SOURCES.length)];
      
      // If term contains 'karaoke', use it. Else append source + karaoke
      const cleanTerm = term.toLowerCase().includes('karaoke') 
          ? term 
          : `${term} ${selectedSource}`; // Inject source to prioritize these channels
      
      const query = encodeURIComponent(cleanTerm);
      
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=20&q=${query}&key=${API_KEY}`
      );
      const searchData = await searchRes.json();
      
      // ERROR HANDLING
      if (searchData.error) {
          console.error("YouTube API Error:", searchData.error);
          setSearchError(`YouTube API Error: ${searchData.error.message} (Reason: ${searchData.error.errors?.[0]?.reason})`);
          setSearchResults([]);
          return;
      }
      
      if (!searchData.items?.length) {
        setSearchResults([]);
        return;
      }

      // 3. Get details
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
            singer: "Host"
        }, "Host");
        alert(`Song is already in library (#${existingSong.song_number})! Added to Queue.`);
        return; // Done
    }

    // Capture User Name for Queue (Optional, defaulting to 'Host' for now as per this specific flow)
    // If request says "save for future use", we insert into 'songs'.

    // 1. Generate new ID
    const { data: maxIdData } = await supabase.from('songs').select('song_number').order('song_number', { ascending: false }).limit(1).single();
    const nextId = (maxIdData?.song_number || 9999) + 1;

    // Helper to format PT to MM:SS
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

    // 2. Insert into Songs Library
    const newSong = {
      song_number: nextId,
      title: video.snippet.title,
      artist: video.snippet.channelTitle,
      youtube_id: video.id, // Direct ID from videos.list
      thumbnail_url: video.snippet.thumbnails.high.url,
      duration: formattedDuration, // Save as MM:SS
      genre: "Unknown", 
      decade: "2020s"
    };

    const { data: songData, error: songError } = await supabase.from('songs').insert([newSong]).select().single();

    if (songError) {
      console.error("Error saving song:", songError);
      alert("Failed to save song to library.");
      return;
    }

    // 3. Add to Queue immediately
    addToQueue({
        id: newSong.song_number,
        title: newSong.title,
        artist: newSong.artist,
        youtubeId: newSong.youtube_id,
        duration: formattedDuration,
        singer: "Host" // Default singer
    }, "Host");
    
    // 4. Update local library state
    setLibrary([songData, ...library]);
    alert(`Added #${nextId} to Library & Queue!`);
  };

const FALLBACK_SONGS = [
    { title: "Bohemian Rhapsody", artist: "Queen", youtube_id: "fJ9rUzIMcZQ", thumbnail: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg" },
    { title: "Sweet Caroline", artist: "Neil Diamond", youtube_id: "GmK5_lnQUbE", thumbnail: "https://i.ytimg.com/vi/GmK5_lnQUbE/hqdefault.jpg" },
    { title: "Dancing Queen", artist: "ABBA", youtube_id: "xFrGuyw1V8s", thumbnail: "https://i.ytimg.com/vi/xFrGuyw1V8s/hqdefault.jpg" },
    { title: "I Want It That Way", artist: "Backstreet Boys", youtube_id: "4fndeDfaWCg", thumbnail: "https://i.ytimg.com/vi/4fndeDfaWCg/hqdefault.jpg" },
    { title: "Don't Stop Believin'", artist: "Journey", youtube_id: "1k8craCGpgs", thumbnail: "https://i.ytimg.com/vi/1k8craCGpgs/hqdefault.jpg" },
    { title: "Livin' On A Prayer", artist: "Bon Jovi", youtube_id: "lDK9QqIzhwk", thumbnail: "https://i.ytimg.com/vi/lDK9QqIzhwk/hqdefault.jpg" },
    { title: "Shallow", artist: "Lady Gaga & Bradley Cooper", youtube_id: "bo_efYhYU2A", thumbnail: "https://i.ytimg.com/vi/bo_efYhYU2A/hqdefault.jpg" },
    { title: "Wannabe", artist: "Spice Girls", youtube_id: "gJLIiF15wjQ", thumbnail: "https://i.ytimg.com/vi/gJLIiF15wjQ/hqdefault.jpg" },
    { title: "Mr. Brightside", artist: "The Killers", youtube_id: "gGdGFtwCNBE", thumbnail: "https://i.ytimg.com/vi/gGdGFtwCNBE/hqdefault.jpg" },
    { title: "Rolling in the Deep", artist: "Adele", youtube_id: "rYEDA3JcQqw", thumbnail: "https://i.ytimg.com/vi/rYEDA3JcQqw/hqdefault.jpg" }
];

  const seedLibrary = async () => {
    setIsSeeding(true);
    let songsToInsert: any[] = [];
    
    try {
        const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
        
        // Curated List of Sources
        const SOURCES = [
            "Atomic Karaoke",
            "PROmusicCOVER",
            "CoversPH",
            "Singstar Karaoke",
            "Top Hits Karaoke",
            "Sing King Karaoke",
            "Karaokey TV",
            "Pinoy Videoke Tambayan"
        ];
        
        // Pick a random source each time to diversify
        const selectedSource = SOURCES[Math.floor(Math.random() * SOURCES.length)];
        console.log(`Attempting to seed via YouTube API (${selectedSource})...`);

        // 1. Fetch Popular Karaoke from selected source
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=50&q=${encodeURIComponent(selectedSource)}&order=viewCount&key=${API_KEY}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error.message); 
        if (!data.items?.length) throw new Error("No songs found");

        const videoIds = data.items.map((i:any) => i.id.videoId).join(',');
        const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${API_KEY}`);
        const detailsData = await detailsRes.json();

        // 2. Filter valid songs (1m - 7m)
        const validVideos = detailsData.items.filter((v:any) => {
             const d = parseDuration(v.contentDetails.duration);
             return d >= 60 && d <= 420; 
        });

        // Map to DB structure
        songsToInsert = validVideos.map((v:any) => ({
            title: v.snippet.title,
            artist: v.snippet.channelTitle,
            youtube_id: v.id,
            thumbnail_url: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || "",
            genre: "Pop",
            decade: "2020s"
        }));

    } catch (e: any) {
        console.warn("YouTube API Validation Failed (likely quota). Switching to Fallback List.", e);
        // Fallback to hardcoded list logic
        songsToInsert = FALLBACK_SONGS.map(s => ({
            title: s.title,
            artist: s.artist,
            youtube_id: s.youtube_id,
            thumbnail_url: s.thumbnail,
            genre: "Classic",
            decade: "Mixed"
        }));
    }

    try {
        if (songsToInsert.length === 0) {
            alert("Unexpected error: No songs explicitly available to insert.");
            setIsSeeding(false);
            return;
        }

        // 3. Get current max ID
        const { data: maxRow } = await supabase.from('songs').select('song_number').order('song_number', { ascending: false }).limit(1).single();
        let currentId = (maxRow?.song_number || 9999);

        // 4. Check existing (ID & Title) to avoid duplicates
        const { data: existing } = await supabase.from('songs').select('youtube_id, title');
        const existingIds = new Set(existing?.map(e => e.youtube_id));
        const existingTitles = new Set(existing?.map(e => normalizeTitle(e.title)));

        const finalInsert: any[] = [];
        songsToInsert.forEach((s) => {
            const cleanTitle = normalizeTitle(s.title);
            
            // Check ID AND Title (fuzzy match)
            if (!existingIds.has(s.youtube_id) && !existingTitles.has(cleanTitle)) {
                currentId++;
                finalInsert.push({ ...s, song_number: currentId });
                
                // Add to current sets to prevent duplicates WITHIN this batch
                existingIds.add(s.youtube_id);
                existingTitles.add(cleanTitle);
            }
        });

        if (finalInsert.length > 0) {
            const { error } = await supabase.from('songs').insert(finalInsert);
            if (error) throw error;
            alert(`Success! Added ${finalInsert.length} unique songs. (Skipped ${songsToInsert.length - finalInsert.length} duplicates)`);
            fetchLibrary();
        } else {
            alert("No new songs to add (all duplicates skipped).");
        }

    } catch (dbError: any) {
        console.error("Database Error:", dbError);
        alert("Database error: " + (dbError.message || "Unknown"));
    } finally {
        setIsSeeding(false);
    }
  };

  const normalizeTitle = (title: string) => {
      if (!title) return "";
      return title
        .toLowerCase()
        .replace(/karaoke/g, '') // Remove 'karaoke'
        .replace(/official/g, '')
        .replace(/lyrics/g, '')
        .replace(/cover/g, '')
        .replace(/hd/g, '')
        .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
        .trim();
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-display selection:bg-primary/30">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 w-full h-16 border-b border-white/5 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
        <Link href="/" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
           <div className="p-2 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-lg">
             <Music className="w-5 h-5 text-white" />
           </div>
        </Link>
          <span className="font-bold text-lg tracking-tight">NumTune <span className="text-violet-400">Songbook</span></span>
        </div>
          <div className="flex items-center gap-4">
             <Link href="/host" className="text-sm font-medium hover:text-primary transition-colors hidden md:block">
               Dashboard
             </Link>
             <Link href="/host" className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-white/10 rounded-full hover:bg-neutral-800 transition-all">
                <Music className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-bold text-white">Open Host</span>
             </Link>
          </div>
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-primary/20" />
          </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-10 space-y-12">
        {/* Search Section */}
        <section className="flex flex-col items-center">
          <h1 className="text-center text-3xl md:text-5xl font-bold tracking-tight mb-8 bg-gradient-to-r from-white to-primary/60 bg-clip-text text-transparent">
            Add New Karaoke Tracks
          </h1>
          <div className="w-full max-w-2xl px-4 py-3 space-y-4">
            {/* Search Bar */}
            <label className="flex flex-col w-full group">
              <div className="flex w-full items-stretch rounded-xl h-14 bg-white dark:bg-[#302839] border border-transparent group-focus-within:border-primary transition-all shadow-xl shadow-black/5 dark:shadow-none">
                <div className="text-[#ab9db9] flex items-center justify-center pl-5 rounded-l-xl">
                  <Search className="w-6 h-6" />
                </div>
                <input 
                    className="w-full bg-transparent border-none focus:outline-none focus:ring-0 px-4 text-base font-normal placeholder:text-[#ab9db9]" 
                    placeholder="Search Artist, Title..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button 
                    onClick={() => performSearch(searchQuery)}
                    disabled={isSearching}
                    className="bg-primary text-white px-6 m-1.5 rounded-lg font-bold text-sm hover:brightness-110 disabled:opacity-50"
                >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                </button>
              </div>
            </label>

            {/* Quick Filters Removed */}
            <div className="flex flex-wrap items-center justify-center gap-2">
               {/* User requested removal of chips */}
            </div>
          </div>
        </section>

        {/* Search Results Grid */}
        <section>
          {/* 1. LIBRARY RESULTS */}
          {libraryResults.length > 0 && (
             <div className="mb-10">
                <div className="flex items-center gap-3 px-4 mb-4">
                    <Music className="w-6 h-6 text-green-400" />
                    <h2 className="text-xl font-bold text-white">Found in Library</h2>
                    <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Ready to Play</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4">
                   {libraryResults.map((song) => (
                        <div key={song.id} className="group flex flex-col gap-3 p-3 rounded-2xl bg-white/5 border border-green-500/20 hover:bg-green-500/10 transition-all">
                             {/* ... existing card style simplified ... */}
                             <div className="flex flex-col flex-grow">
                                <span className="font-black text-green-400">#{song.song_number}</span>
                                <h3 className="font-bold text-base line-clamp-1">{song.title}</h3>
                                <p className="text-[#ab9db9] text-xs">{song.artist}</p>
                             </div>
                             <button 
                                onClick={() => {
                                    addToQueue({
                                        id: song.song_number,
                                        title: song.title,
                                        artist: song.artist,
                                        youtubeId: song.youtube_id,
                                        duration: "00:00",
                                        singer: "Host"
                                    }, "Host");
                                    alert("Added to Queue!");
                                }}
                                className="w-full mt-2 py-2 px-4 bg-green-600 hover:bg-green-500 text-white rounded-full text-sm font-bold flex items-center justify-center gap-2"
                            >
                                <PlusCircle className="w-4 h-4" />
                                Add to Queue
                            </button>
                        </div>
                   ))}
                </div>
                <div className="h-px bg-white/10 my-8 mx-4" /> {/* Divider */}
             </div>
          )}

          {/* 2. YOUTUBE RESULTS */}
          <div className="flex items-center justify-between px-4 mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Disc className="w-6 h-6 text-red-500" />
              {searchResults.length > 0 ? "New from YouTube" : "Trending Karaoke"}
            </h2>
          </div>
          
          {/* Error Display */}
          {searchError && (
              <div className="mx-4 mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-200">
                  <p className="font-bold flex items-center gap-2">
                       <span className="text-xl">⚠️</span> {searchError}
                  </p>
                  <p className="text-sm mt-1 opacity-80">Please check your API Key quota or internet connection.</p>
              </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-4">
            {searchResults.length === 0 && !isSearching && libraryResults.length === 0 && !searchError && (
                <div className="col-span-full text-center text-neutral-500 py-10">
                    <p>{searchQuery ? "No songs found." : "Start searching to find songs."}</p>
                </div>
            )}
            
            {searchResults.map((video) => (
                <div key={video.id} className="group flex flex-col gap-3 p-3 rounded-2xl bg-white dark:bg-[#251b30] hover:ring-2 ring-primary/40 transition-all border border-transparent dark:border-white/5 animate-in fade-in zoom-in duration-300">
                <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg shadow-black/20">
                    <img src={video.snippet.thumbnails.high.url} alt={video.snippet.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-all"></div>
                </div>
                <div className="flex flex-col flex-grow">
                    <h3 className="font-bold text-base line-clamp-2 leading-snug" dangerouslySetInnerHTML={{ __html: video.snippet.title }} />
                    <p className="text-[#ab9db9] text-xs mt-1">{video.snippet.channelTitle}</p>
                </div>
                <button 
                    onClick={() => handleQuickAdd(video)}
                    className="w-full mt-2 py-2 px-4 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-all"
                >
                    <PlusCircle className="w-4 h-4" />
                    Save & Queue
                </button>
                </div>
            ))}
          </div>
        </section>

        {/* Library Table Section */}
        <section className="flex flex-col gap-4 max-w-7xl mx-auto px-4 mt-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Music className="w-6 h-6 text-primary" />
                Current Library
              </h2>
            </div>
            <div className="bg-white dark:bg-[#251b30] rounded-2xl border border-white/5 overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background-light dark:bg-[#302839] text-[#ab9db9] text-[10px] uppercase font-bold tracking-widest">
                    <th className="px-6 py-4"># ID</th>
                    <th className="px-6 py-4">Song Title & Artist</th>
                    <th className="px-6 py-4">Genre</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {library.map((song) => (
                    <tr key={song.id} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-6 py-4 font-black text-primary tracking-wider">{song.song_number}</td>
                        <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="font-bold text-sm line-clamp-1">{song.title}</span>
                            <span className="text-xs text-[#ab9db9]">{song.artist}</span>
                        </div>
                        </td>
                        <td className="px-6 py-4"><span className="text-xs bg-white/5 px-3 py-1 rounded-full">{song.genre || 'Unknown'}</span></td>
                        <td className="px-6 py-4">
                            <div className="flex justify-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 hover:text-primary"><Edit className="w-4 h-4" /></button>
                                <button className="p-1.5 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </td>
                    </tr>
                  ))}
                  {library.length === 0 && (
                      <tr>
                          <td colSpan={5} className="text-center py-12 text-neutral-500">
                             <div className="flex flex-col items-center gap-4">
                                <p>Library is empty.</p>
                                <button 
                                    onClick={seedLibrary}
                                    disabled={isSeeding}
                                    className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-bold transition-all disabled:opacity-50"
                                >
                                    {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                                    Auto-Populate (Random Source)
                                </button>
                             </div>
                          </td>
                      </tr>
                  )}
                </tbody>
              </table>
            </div>
        </section>
      </main>

      {/* Global Stats Footer Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-primary py-2 px-10 text-white flex justify-between items-center text-xs font-bold tracking-widest z-[60] shadow-2xl">
        <div className="flex gap-6 uppercase">
          <span>Library Size: {library.length}</span>
          <span>Last ID: #{library[0]?.song_number || '0000'}</span>
        </div>
        
        {/* Molave Labs Branding */}
        <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
            <span className="hidden sm:inline font-medium opacity-70 tracking-normal capitalize">Created by</span>
            <div className="flex items-center gap-2">
                <img src="/molave-logo.png" alt="Molave Labs" className="h-6 w-auto" />
                <span className="text-sm font-black tracking-widest uppercase">Molave Labs</span>
            </div>
        </div>

        <div className="hidden md:flex items-center gap-1">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          YouTube API Connected
        </div>
      </div>
    </div>
  );
}
