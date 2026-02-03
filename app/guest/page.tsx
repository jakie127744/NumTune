'use client';

import React, { useState } from 'react';
import { Search, Music, Mic2, Star, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

export default function GuestPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [library, setLibrary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomCode, setRoomCode] = useState('');
  const [tempCode, setTempCode] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [songCode, setSongCode] = useState('');
  const [singerName, setSingerName] = useState('');
  const [isQueuing, setIsQueuing] = useState(false);

  // Persistence & URL Params
  React.useEffect(() => {
    // 1. Check URL for ?room=ABCD
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
        setRoomCode(roomParam);
        setHasJoined(true);
        // Save to persistence
        localStorage.setItem('tunr_guest_room', roomParam);
    } else {
        // 2. Check persistence
        const savedRoom = localStorage.getItem('tunr_guest_room');
        if (savedRoom) {
          setRoomCode(savedRoom);
          setHasJoined(true);
        }
    }
  }, []);

  // Fetch Library on Mount
  React.useEffect(() => {
    const fetchSongs = async () => {
      const { data } = await supabase.from('songs').select('*').order('song_number', { ascending: true });
      if (data) setLibrary(data);
      setLoading(false);
    };
    fetchSongs();
    
    // Subscribe to changes (Realtime updates when Host adds songs)
    const channel = supabase
      .channel('public:songs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, (payload) => {
        fetchSongs(); // Refresh on any change
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Filter songs
  const filteredSongs = library.filter(song => 
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    song.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.song_number.toString().includes(searchTerm)
  );

  if (!hasJoined) {
    return (
        <div className="min-h-screen bg-[#0c0811] text-white flex flex-col items-center justify-center p-6 font-display">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm space-y-10 text-center"
            >
                <div className="space-y-4">
                    <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center mx-auto border border-primary/20 shadow-2xl shadow-primary/10">
                        <Smartphone className="w-10 h-10 text-primary" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tight italic uppercase">Join Party</h1>
                        <p className="text-white/40 font-medium">Enter the 4-digit code shown on stage</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <input 
                        type="text"
                        maxLength={4}
                        placeholder="----"
                        value={tempCode}
                        onChange={(e) => setTempCode(e.target.value.toUpperCase())}
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl py-6 text-5xl font-black text-center tracking-[0.6em] text-primary focus:border-primary/50 focus:outline-none transition-all placeholder:text-white/5 shadow-inner"
                    />

                    <button 
                        disabled={tempCode.length < 4}
                        onClick={() => {
                            setRoomCode(tempCode);
                            localStorage.setItem('tunr_guest_room', tempCode);
                            setHasJoined(true);
                        }}
                        className="w-full py-5 rounded-2xl bg-primary text-black font-black text-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 shadow-[0_20px_40px_rgba(var(--primary-rgb),0.3)]"
                    >
                        ENTER ROOM
                    </button>
                </div>

                <div className="pt-10 opacity-20 flex justify-center items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Powered by</span>
                    <span className="text-lg font-bold text-white tracking-widest uppercase">Molave Labs</span>
                </div>
            </motion.div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0811] text-white font-display pb-20">
      
      {/* Header */}
      <header className="sticky top-0 bg-background-dark/95 backdrop-blur-md border-b border-border-dark p-4 z-50">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <Music className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="font-bold text-lg leading-none">Off Key Karaoke</h1>
                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Songbook</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => {
                        if(confirm("Leave this room?")) {
                            localStorage.removeItem('tunr_guest_room');
                            setRoomCode('');
                            setHasJoined(false);
                        }
                    }}
                    className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 shadow-inner hover:bg-red-500/10 hover:border-red-500/30 transition-all group"
                >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse group-hover:bg-red-500" />
                    <span className="text-xs font-black text-violet-400 group-hover:text-red-400 tracking-widest">{roomCode}</span>
                </button>
            </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input 
                    type="text" 
                    placeholder="Search songs, artists..." 
                    className="w-full bg-card-dark border-none rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-primary placeholder:text-neutral-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
            
            {/* Queue Form (Mobile: Top Sticky, Desktop: Right Sidebar) */}
            <div className="lg:col-span-4 lg:sticky lg:top-32 lg:order-2 sticky top-[4.1rem] z-40 bg-[#0c0811] pt-2 pb-6 -mx-4 px-4 lg:mx-0 lg:px-0 lg:pt-0 lg:pb-0 lg:bg-transparent lg:z-auto lg:border-none border-b border-white/10 shadow-2xl lg:shadow-none transition-all">
                <div className="bg-[#120d18] p-6 lg:p-8 rounded-[30px] lg:rounded-[40px] border border-white/10 shadow-2xl space-y-6 lg:space-y-8">
                    <div className="text-center space-y-2">
                        <div className="w-10 h-10 lg:w-12 lg:h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto border border-primary/20 mb-2">
                            <Mic2 className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
                        </div>
                        <h3 className="text-xl lg:text-2xl font-black text-white italic uppercase leading-none">Queue It Up!</h3>
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Instant Stage Access</p>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-4">Song Number</label>
                            <input 
                                type="number" 
                                placeholder="ID" 
                                className="w-full bg-black/40 border-2 border-white/5 rounded-2xl py-4 px-6 text-center text-2xl lg:text-3xl font-black tracking-widest text-primary focus:border-primary/50 focus:outline-none transition-all placeholder:text-white/5 placeholder:text-base placeholder:tracking-normal font-mono"
                                value={songCode}
                                onChange={(e) => setSongCode(e.target.value)}
                            />
                        </div>
                        
                        <div className="space-y-1">
                             <label className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-4">Performer Name</label>
                             <input 
                                type="text" 
                                placeholder="Your Name" 
                                className="w-full bg-black/40 border-2 border-white/5 rounded-2xl py-3 px-6 text-center text-white focus:border-primary/50 focus:outline-none transition-all placeholder:text-white/10 font-bold"
                                value={singerName}
                                onChange={(e) => setSingerName(e.target.value)}
                            />
                        </div>

                        <button 
                            disabled={!songCode || !singerName || isQueuing}
                            onClick={async () => {
                                if (!songCode || !singerName) return;
                                setIsQueuing(true);
                                
                                try {
                                    // 1. Find song by ID
                                    const { data: song, error } = await supabase.from('songs').select('id, title, artist').eq('song_number', songCode).single();
                                    
                                    if (error || !song) {
                                        alert("Song not found! Please check the code in the book.");
                                        setIsQueuing(false);
                                        return;
                                    }

                                    // 2. Add to Queue with Room Code
                                    const { error: queueError } = await supabase.from('queue').insert([{
                                        song_id: song.id,
                                        singer_name: singerName,
                                        status: 'queued',
                                        room_code: roomCode
                                    }]);

                                    if (queueError) {
                                        throw queueError;
                                    } else {
                                        alert(`🎯 Success! "${song.title}" is now in line!`);
                                        setSongCode('');
                                        // Keep singer name for fast multi-song queuing
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert("Oops! Connection lost. Try again.");
                                } finally {
                                    setIsQueuing(false);
                                }
                            }}
                            className="w-full py-4 lg:py-5 bg-primary text-black font-black text-lg rounded-2xl shadow-[0_20px_40px_rgba(var(--primary-rgb),0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 disabled:scale-100 flex items-center justify-center gap-2"
                        >
                            {isQueuing ? (
                                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                            ) : (
                                "QUEUE SONG"
                            )}
                        </button>

                        <button 
                            onClick={() => {
                                if(confirm("Leave this room?")) {
                                    localStorage.removeItem('tunr_guest_room');
                                    window.location.reload();
                                }
                            }}
                            className="w-full text-[10px] font-black text-white/20 hover:text-white/40 transition-colors uppercase tracking-[0.3em] pt-4 lg:hidden"
                        >
                            Log Out
                        </button>
                    </div>
                </div>
                <div className="hidden lg:flex pt-4 opacity-20 justify-center items-center gap-2">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/50">Powered by</span>
                    <span className="text-sm font-black text-white tracking-widest uppercase italic">Molave Labs</span>
                </div>
            </div>

            {/* Library (Mobile: Bottom Scroll, Desktop: Left Content) */}
            <div className="lg:col-span-8 space-y-6 lg:order-1">
                {/* Connection Status */}
                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                    <p className="text-sm font-medium text-white/60 text-xs">Connected to <span className="font-black text-primary uppercase tracking-widest">Live Catalog</span></p>
                </div>

                {/* Song Library */}
                <div>
                    <h2 className="text-xs font-black text-white/20 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                        <Star className="w-3 h-3" /> {searchTerm ? 'Search Results' : 'Digital Songbook'}
                    </h2>
                    
                    <div className="grid grid-cols-1 gap-3">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                <p className="text-sm text-white/20 font-bold uppercase tracking-widest">Syncing Library...</p>
                            </div>
                        )}
                        
                        {!loading && filteredSongs.length === 0 && (
                            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                                <Music className="w-12 h-12 text-white/5 mx-auto mb-4" />
                                <p className="text-white/40 font-medium">No songs found matching "{searchTerm}"</p>
                                <p className="text-[10px] text-white/20 mt-2 uppercase tracking-widest">Try a different search term</p>
                            </div>
                        )}

                        {filteredSongs.map((song) => (
                            <motion.div 
                                key={song.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-2xl p-4 flex items-center justify-between transition-all hover:border-primary/20 active:scale-[0.98]"
                                onClick={() => {
                                    // Quick Fill from Library
                                    setSongCode(song.song_number.toString());
                                    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top to see form!
                                }}
                            >
                                <div className="flex-1 min-w-0 pr-4">
                                    <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors truncate">{song.title}</h3>
                                    <p className="text-sm text-white/40 truncate">{song.artist}</p>
                                    {song.genre !== 'Unknown' && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full text-white/30 font-bold uppercase tracking-tighter border border-white/5">{song.genre}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col items-center justify-center bg-black/40 rounded-xl px-4 py-2 min-w-[70px] border border-white/5 shadow-inner">
                                    <span className="text-[8px] text-white/20 uppercase font-black tracking-widest mb-0.5">Song ID</span>
                                    <span className="text-2xl font-black text-primary font-mono">{song.song_number}</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
      </main>
    </div>
  );
}
