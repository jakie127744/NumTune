'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Users, Monitor, QrCode, Music, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTunrStore } from '@/lib/store';
import { HostPlayer } from '@/components/host/HostPlayer';
import { QueueList } from '@/components/host/QueueList';
import { SongbookPanel } from '@/components/host/SongbookPanel';
import { ConnectQR } from '@/components/host/ConnectQR';
import { supabase } from '@/lib/supabase';


export default function HostDashboard() {
  const { 
    queue, 
    fetchQueue, 
    isPlaying, 
    removeFromQueue, 
    clearQueue,
    subscribeToQueue,
    roomCode,
    setRoomCode,
    generateRoomCode,
    addToQueue,
    moveQueueItem
  } = useTunrStore();
  
  const [activeTab, setActiveTab] = useState<'queue' | 'songbook' | 'requests' | 'users'>('queue');
  const [showQR, setShowQR] = useState(false);
  
  // Custom Room Code State
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [tempRoomCode, setTempRoomCode] = useState('');
  
  // Modals
  const [showNumberEntry, setShowNumberEntry] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [lookupNumber, setLookupNumber] = useState('');
  const [foundSong, setFoundSong] = useState<any>(null);

  React.useEffect(() => {
    const init = async () => {
        await useTunrStore.getState().ensureSession();
        const savedCode = localStorage.getItem('tunr_host_room_code');
        if (savedCode) {
            setRoomCode(savedCode);
        } else if (!roomCode) {
            generateRoomCode();
        }
    };
    init();
  }, []);

  React.useEffect(() => {
    if (roomCode) {
        fetchQueue();
        subscribeToQueue();
    }
  }, [roomCode]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-violet-500/30 font-display">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 w-full h-16 border-b border-white/5 bg-neutral-950/80 backdrop-blur-md z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
           <Link href="/" className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-neutral-400 hover:text-white group">
              <span className="text-sm font-bold tracking-tight">Back</span>
           </Link>
           <div className="h-6 w-px bg-white/10 mx-2" />
           <span className="font-bold text-lg tracking-tight">Off Key <span className="text-violet-400">Karaoke</span></span>
        </div>
        
        {/* Helper Actions */}
        <div className="hidden md:flex items-center gap-4 bg-white/5 p-1.5 rounded-full border border-white/5">
            <button 
                onClick={() => {
                    if (confirm("End current session? This will disconnect everyone.")) {
                        clearQueue();
                        generateRoomCode();
                    }
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-neutral-400 hover:text-rose-400 transition-all hover:bg-rose-500/10"
            >
                <Users className="w-4 h-4" />
                NEW SESSION
            </button>
            <button 
                onClick={() => setShowQR(!showQR)}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all", showQR ? "bg-white text-black" : "text-neutral-400 hover:text-white")}
            >
                <QrCode className="w-3 h-3" />
                GUEST ACCESS
            </button>
        </div>
        
        <div className="flex items-center gap-6">
           {/* Room Code (Editable) */}
           {isEditingCode ? (
               <div className="flex items-center gap-3 bg-violet-600/10 border-2 border-violet-500/50 px-4 py-1.5 rounded-2xl shadow-lg ring-1 ring-violet-500/50">
                   <span className="text-[10px] text-violet-400 uppercase font-black tracking-[0.2em]">Code</span>
                   <input 
                        autoFocus
                        className="w-20 bg-transparent text-xl font-black text-white tracking-widest focus:outline-none uppercase"
                        value={tempRoomCode}
                        onChange={(e) => setTempRoomCode(e.target.value.toUpperCase())}
                        onBlur={async () => {
                            const newCode = tempRoomCode.trim().toUpperCase();
                            if (newCode.length >= 4 && newCode !== roomCode) {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (session?.user) {
                                    const { data: existing } = await supabase.from('rooms').select('owner_id').eq('code', newCode).single();
                                    
                                    if (existing) {
                                        if (existing.owner_id === session.user.id) {
                                            setRoomCode(newCode);
                                            localStorage.setItem('tunr_host_room_code', newCode);
                                        } else {
                                            alert("⚠️ This Room Code is taken!");
                                            setTempRoomCode(roomCode);
                                        }
                                    } else {
                                        const { error } = await supabase.from('rooms').insert({
                                            code: newCode,
                                            owner_id: session.user.id
                                        });
                                        if (!error) {
                                            setRoomCode(newCode);
                                            localStorage.setItem('tunr_host_room_code', newCode);
                                        } else {
                                            alert("Failed to create room.");
                                            setTempRoomCode(roomCode);
                                        }
                                    }
                                }
                            } else if (newCode.length < 4) {
                                setTempRoomCode(roomCode);
                            }
                            setIsEditingCode(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                   />
               </div>
           ) : (
               <button 
                  onClick={() => { setTempRoomCode(roomCode); setIsEditingCode(true); }}
                  className="flex items-center gap-3 bg-violet-600/10 border-2 border-violet-500/20 px-4 py-1.5 rounded-2xl shadow-lg ring-1 ring-violet-500/20 group hover:bg-violet-600/20 hover:border-violet-500/40 transition-all cursor-text"
               >
                   <span className="text-[10px] text-violet-400 uppercase font-black tracking-[0.2em]">Code</span>
                   <span className="text-xl font-black text-white tracking-widest">{roomCode}</span>
               </button>
           )}

            <button 
                 onClick={() => window.open('/stage', 'OffKeyStage', 'width=1920,height=1080')}
                 className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium transition-all group"
            >
                <Monitor className="w-4 h-4 text-violet-400" />
                <span className="group-hover:text-white transition-colors">Stage Screen</span>
            </button>
        </div>
      </header>

      <main className="pt-24 pb-10 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Player (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <HostPlayer />

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-neutral-900/50 border border-white/5 flex flex-col items-center justify-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold">{new Set(queue.map(s => s.singer)).size}</span>
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Singers</span>
            </div>
            <div className="p-4 rounded-2xl bg-neutral-900/50 border border-white/5 flex flex-col items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-pink-400" />
              <span className="text-2xl font-bold">
                 {Math.ceil(queue.reduce((acc, s) => {
                    const [m, sc] = s.duration.split(':').map(Number);
                    return acc + (m * 60) + (sc || 0);
                 }, 0) / 60)}m
              </span>
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Remaining</span>
            </div>
          </div>
        </div>

        {/* Right Column: Queue/Songbook (8 cols) */}
        <div className="lg:col-span-8 flex flex-col h-full space-y-6">
          
          {/* Tab Navigation */}
          <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl self-start">
              <button 
                  onClick={() => setActiveTab('queue')}
                  className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", activeTab === 'queue' ? "bg-violet-600 text-white shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/5")}
              >
                  Queue
              </button>
              <button 
                  onClick={() => setActiveTab('songbook')}
                  className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2", activeTab === 'songbook' ? "bg-violet-600 text-white shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/5")}
              >
                  <Music className="w-4 h-4" />
                  Songbook
              </button>
          </div>

          <div className="flex-1 bg-neutral-900/30 rounded-3xl border border-white/5 p-2 overflow-hidden flex flex-col">
             {activeTab === 'songbook' ? (
                 <div className="p-2 h-full">
                     <SongbookPanel />
                 </div>
             ) : (
                 <>
                    <div className="flex items-center justify-between border-b border-white/5 p-4 pb-2">
                        <h2 className="text-xl font-bold">Up Next</h2>
                        {queue.length > 0 && <button onClick={clearQueue} className="text-xs text-red-500 hover:underline">Clear Queue</button>}
                    </div>
                    <QueueList 
                        queue={queue}
                        onRemove={removeFromQueue}
                        onMove={(id, dir) => moveQueueItem(id, dir)}
                        onOpenNumberEntry={() => setShowNumberEntry(true)}
                        onOpenManualEntry={() => setShowManualEntry(true)}
                    />
                 </>
             )}
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      {showQR && <ConnectQR roomCode={roomCode} onClose={() => setShowQR(false)} />}

      {/* Number Entry Modal */}
      {showNumberEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
           {/* Simple inline implementation for speed, ideally extract this too */}
           <div className="bg-neutral-900 border border-violet-500/30 p-6 rounded-3xl w-full max-w-sm">
             <h3 className="text-xl font-bold mb-4">Find Song</h3>
             {!foundSong ? (
                 <div className="space-y-4">
                     <input 
                        autoFocus
                        placeholder="Song ID (e.g. 1042)"
                        className="w-full bg-black/50 p-4 text-center text-2xl font-mono rounded-xl"
                        value={lookupNumber}
                        onChange={(e) => setLookupNumber(e.target.value)}
                        onKeyDown={async (e) => {
                             if(e.key === 'Enter') {
                                 const { data } = await supabase.from('songs').select('*').eq('song_number', parseInt(lookupNumber)).single();
                                 if(data) setFoundSong(data); else alert("Not found");
                             }
                        }}
                     />
                     <button onClick={() => setShowNumberEntry(false)} className="w-full py-3 text-neutral-500">Cancel</button>
                 </div>
             ) : (
                 <div className="space-y-4">
                     <div className="flex gap-4 items-center bg-white/5 p-2 rounded-xl">
                         <div className="w-12 h-12 bg-cover rounded" style={{backgroundImage: `url(${foundSong.thumbnail_url})`}}/>
                         <div>{foundSong.title}<br/><span className="text-xs text-neutral-400">{foundSong.artist}</span></div>
                     </div>
                     <input id="singer-name" placeholder="Singer Name" className="w-full p-2 rounded bg-black/50" autoFocus />
                     <div className="flex gap-2">
                         <button onClick={() => { setFoundSong(null); setLookupNumber(''); }} className="flex-1 py-2 bg-white/10 rounded">Back</button>
                         <button onClick={() => {
                             const singer = (document.getElementById('singer-name') as HTMLInputElement).value || "Guest";
                             addToQueue({
                                 id: foundSong.song_number,
                                 title: foundSong.title,
                                 artist: foundSong.artist,
                                 youtubeId: foundSong.youtube_id,
                                 duration: foundSong.duration,
                                 singer
                             }, singer);
                             setShowNumberEntry(false);
                             setFoundSong(null);
                             setLookupNumber('');
                         }} className="flex-[2] py-2 bg-violet-600 rounded text-white font-bold">Add</button>
                     </div>
                 </div>
             )}
           </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showManualEntry && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-white/10 p-6 rounded-3xl w-full max-w-md space-y-4">
                  <h3 className="font-bold text-xl">Manual Queue</h3>
                  <input id="m-title" placeholder="Title" className="w-full p-3 rounded bg-black/50" />
                  <input id="m-artist" placeholder="Artist" className="w-full p-3 rounded bg-black/50" />
                  <input id="m-singer" placeholder="Singer" className="w-full p-3 rounded bg-black/50" />
                  <div className="flex gap-2">
                      <button onClick={() => setShowManualEntry(false)} className="flex-1 py-3 bg-white/5 rounded">Cancel</button>
                      <button onClick={() => {
                          const title = (document.getElementById('m-title') as HTMLInputElement).value;
                          const artist = (document.getElementById('m-artist') as HTMLInputElement).value || 'Unknown';
                          const singer = (document.getElementById('m-singer') as HTMLInputElement).value;
                          if (title && singer) {
                              addToQueue({
                                  id: Math.floor(Math.random() * 99999),
                                  title, artist, singer, youtubeId: '', duration: '0:00'
                              }, singer);
                              setShowManualEntry(false);
                          }
                      }} className="flex-1 py-3 bg-violet-600 rounded font-bold">Queue</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
