'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, PlusCircle, Edit, Trash2, Loader2, Music, CloudDownload, Link as LinkIcon } from 'lucide-react';
import { supabase, fetchAllRows, upsertSongByYoutubeId } from '@/lib/supabase';
import { useTunrStore } from '@/lib/store';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { roomCodeStorage } from '@/lib/roomCodeStorage';
import { extractVideoId, lookupYouTubeVideo, YouTubeVideoInfo } from '@/lib/youtube';

export default function SongbookPage() {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [library, setLibrary] = useState<any[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Store actions
  const addToQueue = useTunrStore((state) => state.addToQueue);
  const roomCode = useTunrStore((state) => state.roomCode);

  // Load Library on Mount
  useEffect(() => {
    const init = async () => {
        // Ensure store knows we are host
        useTunrStore.setState({ isHost: true });

        // Recover Room Code from Host session
        const savedCode = roomCodeStorage.get();
        if (savedCode) {
            useTunrStore.getState().setRoomCode(savedCode);
        }

        // Only the admin account ever sees delete controls - and only outside production
        const { data: { session } } = await supabase.auth.getSession();
        const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
        setIsAdmin(process.env.NODE_ENV !== 'production' && !!adminEmail && session?.user?.email === adminEmail);

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
      toast.error("Invalid YouTube link. Paste a full YouTube URL or an 11-character video ID.");
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
        if (roomCode) {
            addToQueue({
                id: existingSong.song_number,
                title: existingSong.title,
                artist: existingSong.artist,
                youtubeId: existingSong.youtube_id,
                duration: "00:00",
                singer: "Host"
            }, "Host");
            toast.success(`Song is already in library (#${existingSong.song_number})! Added to Queue.`);
        } else {
            toast.info(`Song is already in library (#${existingSong.song_number}).`);
        }
        return; // Done
    }

    // Capture User Name for Queue (Optional, defaulting to 'Host' for now as per this specific flow)
    // If request says "save for future use", we insert into 'songs'.

    // 1. Generate new ID
    const { data: maxIdData, error: maxIdError } = await supabase
      .from('songs')
      .select('song_number')
      .order('song_number', { ascending: false })
      .limit(1);

    if (maxIdError) {
      console.error("Error fetching max song number:", maxIdError);
      toast.error(`Failed to determine the next song number: ${maxIdError.message}`);
      return;
    }

    const nextId = (maxIdData && maxIdData.length > 0 ? maxIdData[0].song_number : 9999) + 1;

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
      duration: formattedDuration, // Save as MM:SS
      genre: "Unknown", 
      decade: "2020s"
    };

    const { data: savedSong, error: songError } = await upsertSongByYoutubeId<any>(newSong);

    if (songError || !savedSong) {
      console.error("Error saving song:", songError);
      toast.error(`Failed to save song to library: ${songError?.message || 'No data returned'}`);
      return;
    }

    // 3. Add to Queue immediately (only if a room is active)
    if (roomCode) {
        addToQueue({
            id: savedSong.song_number,
            title: savedSong.title,
            artist: savedSong.artist,
            youtubeId: savedSong.youtube_id,
            duration: formattedDuration,
            singer: "Host" // Default singer
        }, "Host");
    }

    // 4. Update local library state
    setLibrary([savedSong, ...library]);
    toast.success(roomCode
        ? `Added #${savedSong.song_number} to Library & Queue!`
        : `Added #${savedSong.song_number} to Library!`);
  };

  const handleDeleteSong = async (songId: number, songNumber: number) => {
    if (!(await confirmDialog(`Delete song #${songNumber} from library?`))) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/songs?id=${songId}`, {
        method: 'DELETE',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Delete error:', data.error);
        toast.error(`Failed to delete song: ${data.error}`);
        return;
      }
      setLibrary(library.filter(s => s.id !== songId));
      toast.success(`Song #${songNumber} deleted.`);
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(`Failed to delete song: ${error.message}`);
    }
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
    // Starter set for an empty library (YouTube search is gone, so this no
    // longer pulls from a random channel).
    const songsToInsert = FALLBACK_SONGS.map(s => ({
        title: s.title,
        artist: s.artist,
        youtube_id: s.youtube_id,
        thumbnail_url: s.thumbnail,
        genre: "Classic",
        decade: "Mixed"
    }));

    try {
        if (songsToInsert.length === 0) {
            toast.error("Unexpected error: No songs explicitly available to insert.");
            setIsSeeding(false);
            return;
        }

        // 3. Get current max ID
        const { data: maxRow } = await supabase.from('songs').select('song_number').order('song_number', { ascending: false }).limit(1).single();
        let currentId = (maxRow?.song_number || 9999);

        // 4. Check existing (ID & Title) to avoid duplicates
        const existing = await fetchAllRows<{ youtube_id: string; title: string }>('songs', (q) => q.select('youtube_id, title'));
        const existingIds = new Set(existing.map(e => e.youtube_id));
        const existingTitles = new Set(existing.map(e => normalizeTitle(e.title)));

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
            // finalInsert is already pre-filtered against existing youtube_ids/titles above,
            // so a plain insert is the real fallback if the unique constraint
            // (migration_songs_unique_youtube_id.sql) hasn't been applied yet -
            // the upsert's onConflict is just defense-in-depth for that race.
            let { error } = await supabase.from('songs').upsert(finalInsert, { onConflict: 'youtube_id', ignoreDuplicates: true });
            if (error?.message?.includes('no unique or exclusion constraint')) {
                const fallback = await supabase.from('songs').insert(finalInsert);
                error = fallback.error;
            }
            if (error) throw error;
            toast.success(`Success! Added ${finalInsert.length} unique songs. (Skipped ${songsToInsert.length - finalInsert.length} duplicates)`);
            fetchLibrary();
        } else {
            toast.info("No new songs to add (all duplicates skipped).");
        }

    } catch (dbError: any) {
        console.error("Database Error:", dbError);
        toast.error("Database error: " + (dbError.message || "Unknown"));
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
          <span className="font-bold text-lg tracking-tight">Off Key <span className="text-violet-400">Karaoke</span></span>
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
                    placeholder="Search your library..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </label>

            {/* Add a new song by pasting its YouTube link */}
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-violet-500/20" />
                  <span className="text-xs text-violet-400 font-black uppercase tracking-[0.2em] px-4">Add a New Song</span>
                  <div className="h-px flex-1 bg-violet-500/20" />
                </div>

                <div className="group relative">
                   <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                   <label className="relative flex flex-col w-full">
                    <div className="flex w-full items-stretch rounded-xl h-14 bg-neutral-900 border border-violet-500/30 group-focus-within:border-violet-500 transition-all shadow-2xl">
                        <div className="text-violet-400 flex items-center justify-center pl-5">
                        <LinkIcon className="w-5 h-5" />
                        </div>
                        <input
                            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 px-4 text-base font-normal text-white placeholder:text-neutral-500"
                            placeholder="Paste a YouTube link (e.g. youtube.com/watch?v=...)"
                            value={manualUrl}
                            onChange={(e) => setManualUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUrlAdd()}
                        />
                        <button
                            onClick={handleUrlAdd}
                            disabled={isFetchingUrl || !manualUrl}
                            className="bg-violet-600 text-white px-6 m-1.5 rounded-lg font-bold text-sm hover:bg-violet-500 transition-all disabled:opacity-50 shadow-lg shadow-violet-600/20"
                        >
                            {isFetchingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch & Add'}
                        </button>
                    </div>
                    </label>
                </div>

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
                                    toast.success("Added to Queue!");
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

          {searchQuery.trim() && libraryResults.length === 0 && (
              <div className="text-center text-neutral-500 py-10 px-4">
                  <p>No songs in the library match &ldquo;{searchQuery}&rdquo;.</p>
                  <p className="text-sm mt-1">Find it on YouTube and paste the link above to add it.</p>
              </div>
          )}
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
                                {isAdmin && (
                                    <button onClick={() => handleDeleteSong(song.id, song.song_number)} className="p-1.5 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                )}
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
                                    Add Starter Songs
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

      </div>
    </div>
  );
}
