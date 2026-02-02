'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Mic2, Music, Users, 
  Settings, Search, ListMusic, UserPlus, Clock, Monitor, Share2, QrCode, Trash2, Edit2, Check, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTunrStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import QRCode from 'react-qr-code';
import dynamic from 'next/dynamic';
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any;

export default function HostDashboard() {
  const { 
    queue, 
    currentSong, 
    fetchQueue, 
    isPlaying, 
    setIsPlaying, 
    removeFromQueue, 
    playNext, 
    playPrevious,
    syncPosition,
    forceReset,
    clearQueue,
    togglePlay,
    addToQueue,
    subscribeToQueue,
    roomCode,
    setRoomCode,
    generateRoomCode
  } = useTunrStore();
  
  const [activeTab, setActiveTab] = useState<'queue' | 'requests' | 'users'>('queue');
  const [showMonitor, setShowMonitor] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [hostMuted, setHostMuted] = useState(true); // Default to muted to prevent feedback
  const [showManualEntry, setShowManualEntry] = useState(false);
  
  // Custom Room Code State
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [tempRoomCode, setTempRoomCode] = useState('');
  
  // Number Entry State
  const [showNumberEntry, setShowNumberEntry] = useState(false);
  const [lookupNumber, setLookupNumber] = useState('');
  const [foundSong, setFoundSong] = useState<any>(null);

  // Initialize Data & Persistence
  React.useEffect(() => {
    // 1. Check for saved custom code
    const savedCode = localStorage.getItem('tunr_host_room_code');
    
    if (savedCode) {
        setRoomCode(savedCode);
    } else if (!roomCode) {
        generateRoomCode();
    }
  }, []);

  // Check for missing keys
  const isUsingPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder');

  if (isUsingPlaceholder) {
      return (
          <div className="flex h-screen items-center justify-center bg-red-950 text-white p-10 font-bold text-center">
               <div className="space-y-4">
                  <h1 className="text-4xl">⚠️ MISSING DATABASE KEYS</h1>
                  <p className="text-xl opacity-80">The app is running, but it's not connected to your database.</p>
                  <div className="bg-black/30 p-6 rounded-xl text-left font-mono text-sm space-y-2 mt-4 inline-block">
                      <p>Go to Vercel Settings {'>'} Environment Variables:</p>
                      <p className="text-green-400">NEXT_PUBLIC_SUPABASE_URL</p>
                      <p className="text-green-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
                  </div>
               </div>
          </div>
      );
  }

  // Fetch queue when room code changes
  React.useEffect(() => {
    if (roomCode) {
        fetchQueue();
        subscribeToQueue();
    }
  }, [roomCode]);

  // Requests would be fetched from DB in a real scenario, filtering queue by status='requested'
  // For now, ensuring no mock data is shown.
  const requests: any[] = [];
  
  // Playback Timer Sync
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = React.useRef(0);
  const [playerStatus, setPlayerStatus] = useState('Initializing');
  const lastProgressRef = React.useRef(Date.now());

  // Keep ref in sync for heartbeat
  React.useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);
 // For heartbeat check

  // No song playing
  const [playerResetKey, setPlayerResetKey] = useState(0);

  // Reset timer on new song
  React.useEffect(() => {
    setElapsed(0);
  }, [currentSong?.id]);

  // Sync Pause/Play with Visual IFrame
  React.useEffect(() => {
    const iframe = document.getElementById('visual-iframe-host') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
        const command = isPlaying ? 'playVideo' : 'pauseVideo';
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
    }
  }, [isPlaying, currentSong?.id]);

  // Parse duration "MM:SS" to seconds
  // ...

  // HYBRID TIMER: Run local interval only if we have recent heartbeats
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
         // Only increment if video reported progress in last 2 seconds
         if (Date.now() - lastProgressRef.current < 2000) {
            setElapsed(prev => prev + 1);
         }
         
         // GHOST PROTOCOL: Fallback Auto-Next
         // If we are past the duration by 5 seconds, FORCE NEXT
         if (currentSong?.duration && elapsed > getDurationSeconds(currentSong.duration) + 5) {
             console.log("Ghost Protocol: Forcing Next Song");
             playNext();
             setElapsed(0); // Reset immediately to prevent double-firing
         }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, elapsed, currentSong]); // Added dependencies for Ghost Protocol

  // MASTER HEARTBEAT: Constant Pulse (Low frequency when paused)
  React.useEffect(() => {
    if (!currentSong?.id) return;
    
    const interval = setInterval(() => {
         // Use the latest Ref value to avoid stale sync
         syncPosition(elapsedRef.current);
    }, isPlaying ? 333 : 1000); 

    return () => clearInterval(interval);
  }, [isPlaying, currentSong?.id]); // Only reset on major state changes
  const getDurationSeconds = (f: string) => {
    if (!f) return 0;
    const parts = f.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };



  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60); // Ensure integer
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-violet-500/30 font-display">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 w-full h-16 border-b border-white/5 bg-neutral-950/80 backdrop-blur-md z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
           <Link href="/" className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-neutral-400 hover:text-white group">
              <div className="p-1.5 bg-neutral-900 rounded-lg group-hover:bg-neutral-800 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </div>
              <span className="text-sm font-bold tracking-tight">Back</span>
           </Link>
           <div className="h-6 w-px bg-white/10 mx-2" />
           <span className="font-bold text-lg tracking-tight">NumTune <span className="text-violet-400">Host</span></span>
        </div>
        
        {/* Center Actions */}
        <div className="hidden md:flex items-center gap-4 bg-white/5 p-1.5 rounded-full border border-white/5">
             <Link 
                href="/songbook"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-neutral-400 hover:text-white transition-all"
             >
                <Music className="w-4 h-4" />
                LIBRARY
             </Link>
             <button 
                onClick={() => {
                    if (confirm("End current session and generate a new room code? This will disconnect current stages and guests.")) {
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
                onClick={() => setShowMonitor(!showMonitor)}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all", showMonitor ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white")}
             >
                <Monitor className="w-3 h-3" />
                STAGE MONITOR
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
           {/* Prominent Party Code Display */}
           <div className="flex items-center gap-3 bg-violet-600/10 border-2 border-violet-500/20 px-4 py-1.5 rounded-2xl shadow-lg ring-1 ring-violet-500/20 group hover:bg-violet-600/20 transition-all">
              {!isEditingCode ? (
                <>
                  <span className="text-[10px] text-violet-400 uppercase font-black tracking-[0.2em]">Code</span>
                  <a href={`/guest?room=${roomCode}`} target="_blank" className="text-xl font-black text-white tracking-widest hover:text-violet-200 transition-colors" title="Open Guest View">{roomCode}</a>
                  <button 
                    onClick={() => {
                        setTempRoomCode(roomCode);
                        setIsEditingCode(true);
                    }}
                    className="p-1.5 text-violet-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                    <input 
                        type="text" 
                        value={tempRoomCode}
                        onChange={(e) => setTempRoomCode(e.target.value.toUpperCase().slice(0, 4))}
                        className="w-16 bg-black/50 border border-violet-500/50 rounded px-1 py-0.5 text-center font-black tracking-widest text-lg uppercase focus:outline-none focus:border-violet-400 text-white"
                        autoFocus
                    />
                    <button 
                        onClick={() => {
                            if (tempRoomCode.length < 3) {
                                alert("Code must be at least 3 characters.");
                                return;
                            }
                            setRoomCode(tempRoomCode);
                            localStorage.setItem('tunr_host_room_code', tempRoomCode);
                            setIsEditingCode(false);
                            // Clear queue for new room to avoid mixing? 
                            // Optional: clearQueue(); 
                            // user might want to keep queue but just change code name.
                            window.location.reload(); // Force reload to ensure clean slate with new code
                        }}
                        className="p-1 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                    <button 
                         onClick={() => setIsEditingCode(false)}
                         className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
              )}
           </div>

            <button 
                 onClick={() => forceReset()}
                 className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full border border-red-500/20 transition-all text-[10px] font-black uppercase tracking-widest"
                 title="Force all screens to reset and re-sync"
            >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Resync All
            </button>

            <button 
                 onClick={() => window.open('/stage', 'NumTuneStage', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no')}
                 className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium transition-all group"
            >
                <Monitor className="w-4 h-4 text-violet-400" />
                <span className="group-hover:text-white transition-colors">Stage Screen</span>
            </button>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-full border border-white/5">
            <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-[10px] uppercase tracking-widest font-black text-neutral-400">
                {isPlaying ? 'Sync Active' : 'Ready'}
            </span>
          </div>
          <button onClick={() => fetchQueue()} className="p-2 hover:bg-white/10 rounded-full transition-colors group" title="Sync Queue">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400 group-hover:text-white group-hover:rotate-180 transition-all duration-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400" />
        </div>
      </header>

      <main className="pt-24 pb-10 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Now Playing & Controls (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Live Monitor Preview (Always Mounted for Timer Sync) */}
          <div className={cn("transition-all duration-500 ease-in-out overflow-hidden", showMonitor ? "max-h-96 opacity-100" : "max-h-0 opacity-0")}>
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-black shadow-2xl relative aspect-video group">
                <div className="absolute top-2 left-2 z-[100] flex gap-2">
                    <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">LIVE FEED</div>
                    {/* Status Bar */}
                    <div className="bg-black/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1.5 backdrop-blur-md">
                        <div className={cn("w-1.5 h-1.5 rounded-full", isPlaying ? "bg-green-500 animate-pulse" : "bg-yellow-500")} />
                        <span className="text-white/80 max-w-[200px] truncate uppercase tracking-tighter">
                            {isPlaying ? 'Live' : 'Paused'}: {currentSong?.title || 'No Song'}
                        </span>
                        <div className="flex gap-1 items-center border-l border-white/10 pl-1.5 ml-0.5">
                            <button onClick={() => { setIsPlaying(true); setPlayerStatus('Focusing...'); }} className="hover:text-green-500 transition-colors uppercase">Play</button>
                            <button onClick={() => { setIsPlaying(false); setPlayerStatus('Stopped'); }} className="hover:text-red-500 transition-colors uppercase">Stop</button>
                            <button onClick={() => { setHostMuted(!hostMuted) }} className="hover:text-primary transition-colors flex items-center gap-1 uppercase">
                                {hostMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                                {hostMuted ? 'Muted' : 'Audio On'}
                            </button>
                            <button onClick={() => { setPlayerResetKey(prev => prev + 1); forceReset(); }} className="hover:text-orange-500 transition-colors uppercase">Fix</button>
                        </div>
                    </div>
                    <a 
                        href={`https://www.youtube.com/watch?v=${currentSong?.youtubeId}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded hover:bg-blue-500 transition-colors"
                    >
                        VERIFY ID
                    </a>
                </div>

                {/* Hybrid Storage Player: IFrame for Visuals, ReactPlayer for Events */}
                <div id="yt-player-container" className="absolute inset-0 z-20 overflow-hidden bg-black">
                    {currentSong?.youtubeId && (
                        <div className="relative w-full h-full">
                            {/* Visual Layer: Raw IFrame (Highly Reliable) */}
                            <iframe 
                                id="visual-iframe-host"
                                key={`visual-${currentSong.youtubeId}-${playerResetKey}`}
                                src={`https://www.youtube-nocookie.com/embed/${currentSong.youtubeId}?autoplay=1&mute=1&controls=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}`}
                                className="absolute inset-0 w-full h-full border-0 z-10"
                                allow="autoplay; encrypted-media"
                            />

                            {/* Logic Layer: Hidden ReactPlayer (Handles Auto-Next) */}
                            <div className="opacity-[0.01] pointer-events-none absolute bottom-0 right-0 w-2 h-2 overflow-hidden bg-black">
                                <ReactPlayer
                                    key={`logic-${currentSong.youtubeId}-${playerResetKey}`}
                                    url={`https://www.youtube.com/watch?v=${currentSong.youtubeId}`}
                                    playing={Boolean(isPlaying)}
                                    muted={hostMuted}
                                    onEnded={playNext}
                                    onReady={() => setPlayerStatus('Sync Ready')}
                                    onProgress={(progress: any) => {
                                        setElapsed(progress.playedSeconds);
                                    }}
                                    onError={(e: any) => console.error("Logic Player Error:", e)}
                                    config={{
                                        youtube: {
                                            playerVars: { playsinline: 1, origin: typeof window !== 'undefined' ? window.location.origin : '' }
                                        }
                                    }}
                                    progressInterval={100}
                                />
                            </div>
                        </div>
                    )}
                    {!currentSong?.youtubeId && (
                        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50 text-white/20 text-[10px] uppercase font-bold">
                            Waiting for Session
                        </div>
                    )}
                </div>
            </div>
          </div>

          {/* QR Code Card */}
          {showQR && (
             <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 bg-white text-black rounded-3xl flex flex-col items-center text-center space-y-4 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
             >
                <div className="bg-white p-2 rounded-xl">
                    <QRCode value={`${window.location.origin}/guest?room=${roomCode}`} size={150} />
                </div>
                <div>
                    <h3 className="font-bold text-xl">Join the Party!</h3>
                    <p className="text-sm text-neutral-500 max-w-[200px] mx-auto">Scan to join room <span className="font-bold text-black">{roomCode}</span></p>
                </div>
             </motion.div>
          )}

          {/* Now Playing Card */}
          {currentSong ? (
          <motion.div 
            className="group relative overflow-hidden rounded-3xl bg-neutral-900/50 border border-white/5 p-6 shadow-2xl shadow-black/50"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="space-y-1 mb-6 relative z-10">
              <div className="inline-flex items-center gap-2 px-2 py-1 bg-violet-500/10 rounded-lg border border-violet-500/20 mb-2">
                  <Mic2 className="w-3 h-3 text-violet-400" />
                  <span className="text-xs font-bold text-violet-200 uppercase tracking-wider">{currentSong.singer}</span>
              </div>
              <h2 className="text-2xl font-bold text-white leading-tight truncate">{currentSong.title}</h2>
              <p className="text-neutral-400 text-sm truncate">{currentSong.artist}</p>
            </div>

            {/* Progress */}
            <div className="space-y-2 mb-6 relative z-10">
              <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" 
                  initial={{ width: 0 }}
                  animate={{ width: `${currentSong ? (elapsed / Math.max(getDurationSeconds(currentSong.duration), 1)) * 100 : 0}%` }}
                  transition={{ ease: "linear", duration: 0.5 }} // Smooth updates
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-500 font-medium">
                <span>{formatTime(elapsed)}</span>
                <span>{currentSong.duration}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between relative z-10">
              <button className="p-3 text-neutral-400 hover:text-white transition-colors">
                <Volume2 className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-4">
                <button onClick={playPrevious} className="p-3 text-neutral-400 hover:text-white transition-colors group/back">
                  <SkipBack className="w-6 h-6 group-hover/back:-translate-x-0.5 transition-transform" />
                </button>
                <button 
                  onClick={togglePlay}
                  className="w-14 h-14 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-1" />}
                </button>
                <button onClick={playNext} className="p-3 text-neutral-400 hover:text-white transition-colors group/skip">
                  <SkipForward className="w-6 h-6 group-hover/skip:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
          ) : (
             <div className="p-8 rounded-3xl bg-neutral-900/50 border border-white/5 text-center text-neutral-500">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="mb-4">No song playing</p>
                {queue.length > 0 && (
                    <button 
                        onClick={playNext}
                        className="px-6 py-3 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] flex items-center gap-2 mx-auto"
                    >
                        <Play className="w-5 h-5 fill-current" />
                        Start Session ({queue.length})
                    </button>
                )}
             </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-neutral-900/50 border border-white/5 flex flex-col items-center justify-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold">
                {new Set(queue.map(s => s.singer)).size}
              </span>
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Singers</span>
            </div>
            <div className="p-4 rounded-2xl bg-neutral-900/50 border border-white/5 flex flex-col items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-pink-400" />
              <span className="text-2xl font-bold">
                 {(() => {
                    const totalSeconds = queue.reduce((acc, song) => {
                        const [m, s] = song.duration.split(':').map(Number);
                        return acc + (m * 60) + (s || 0);
                    }, 0);
                    return Math.ceil(totalSeconds / 60) + "m";
                 })()}
              </span>
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Remaining</span>
            </div>
          </div>
        </div>

        {/* Right Column: Queue & Requests (8 cols) */}
        <div className="lg:col-span-8 flex flex-col h-full space-y-6">
          
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-white/5 pb-1">
            <div className="flex items-center gap-6">
                <button 
                onClick={() => setActiveTab('queue')}
                className={cn(
                    "pb-3 text-sm font-medium transition-colors relative", 
                    activeTab === 'queue' ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                )}
                >
                Up Next
                {activeTab === 'queue' && <motion.div layoutId="tab" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-violet-500" />}
                </button>
                <button 
                onClick={() => setActiveTab('requests')}
                className={cn(
                    "pb-3 text-sm font-medium transition-colors relative flex items-center gap-2", 
                    activeTab === 'requests' ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                )}
                >
                Requests
                <span className="px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[10px] font-bold">2</span>
                {activeTab === 'requests' && <motion.div layoutId="tab" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-violet-500" />}
                </button>
            </div>

            {activeTab === 'queue' && queue.length > 0 && (
                <button 
                    onClick={() => { if(confirm("Clear the entire queue?")) clearQueue(); }}
                    className="mb-3 text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2.5 py-1 rounded-full border border-red-500/20 transition-all font-bold uppercase tracking-wider"
                >
                    Clear All
                </button>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-neutral-900/30 rounded-3xl border border-white/5 p-2 overflow-hidden flex flex-col">
            
            {activeTab === 'queue' && (
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {queue.map((song, index) => (
                  <motion.div 
                    key={song.queueId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 p-4 hover:bg-white/5 rounded-xl group transition-all"
                  >
                    <div className="text-neutral-500 font-medium w-4 text-center">{index + 1}</div>
                    <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-600 group-hover:bg-violet-500/20 group-hover:text-violet-400 transition-colors">
                      <Music className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">{song.title}</h3>
                      <p className="text-neutral-400 text-sm truncate">{song.artist}</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-medium text-neutral-300">{song.singer}</div>
                        <div className="text-xs text-neutral-500">Ready</div>
                      </div>
                      <div className={cn("w-8 h-8 rounded-full border-2 border-neutral-950 bg-gradient-to-br from-purple-500 to-blue-500")} />
                    </div>

                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if (song.queueId) removeFromQueue(song.queueId);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 rounded-lg text-neutral-400 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))}
                
                {queue.length === 0 && (
                    <div className="text-center py-10 text-neutral-500">
                        <p>Queue is empty.</p>
                        <button className="text-primary hover:underline mt-2 text-sm">Start Auto-DJ?</button>
                    </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 mt-4">
                     <button 
                        onClick={() => setShowNumberEntry(true)}
                        className="py-3 border-2 border-dashed border-violet-500/30 bg-violet-500/10 rounded-xl text-violet-300 hover:border-violet-500 hover:text-white hover:bg-violet-500 transition-all flex items-center justify-center gap-2 font-bold"
                      >
                        <ListMusic className="w-5 h-5" />
                        Queue by Number
                      </button>
                    <button 
                      onClick={() => setShowManualEntry(true)}
                      className="py-3 border-2 border-dashed border-neutral-800 rounded-xl text-neutral-500 hover:border-white/20 hover:text-neutral-300 hover:bg-white/5 transition-all flex items-center justify-center gap-2 font-medium"
                    >
                      <UserPlus className="w-4 h-4" />
                      Manual Entry
                    </button>
                </div>
              </div>
            )}

            {/* Queue by Number Modal */}
            {showNumberEntry && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-neutral-900 border border-violet-500/30 p-6 rounded-3xl w-full max-w-sm shadow-2xl space-y-6"
                    >
                        <div className="text-center">
                            <h3 className="text-2xl font-bold text-white mb-1">Queue by Number</h3>
                            <p className="text-neutral-400 text-sm">Enter the Song ID to lookup</p>
                        </div>

                        {!foundSong ? (
                            <div className="space-y-4">
                                <input 
                                    autoFocus
                                    type="number" 
                                    placeholder="e.g. 10042" 
                                    className="w-full bg-black/50 border border-white/20 rounded-2xl px-4 py-4 text-center text-3xl font-mono tracking-widest text-white focus:border-violet-500 focus:outline-none placeholder:text-neutral-700" 
                                    value={lookupNumber}
                                    onChange={(e) => setLookupNumber(e.target.value)}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                           // Lookup
                                           const { data, error } = await supabase.from('songs').select('*').eq('song_number', parseInt(lookupNumber)).single();
                                           if (data) {
                                               setFoundSong(data);
                                           } else {
                                               alert("Song not found!");
                                           }
                                        }
                                    }}
                                />
                                <button 
                                    onClick={async () => {
                                        if (!lookupNumber) return;
                                        const { data, error } = await supabase.from('songs').select('*').eq('song_number', parseInt(lookupNumber)).single();
                                        if (data) {
                                            setFoundSong(data);
                                        } else {
                                            alert("Song not found!");
                                        }
                                    }}
                                    className="w-full py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-colors"
                                >
                                    🔍 Find Song
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4 bg-violet-500/10 p-4 rounded-xl border border-violet-500/20">
                                <div className="flex gap-4">
                                    <div className="w-16 h-16 bg-neutral-800 rounded-lg shrink-0 bg-center bg-cover" style={{ backgroundImage: `url(${foundSong.thumbnail_url})`}} />
                                    <div>
                                        <div className="badge bg-violet-500 text-white text-[10px] px-1.5 py-0.5 rounded w-fit mb-1">#{foundSong.song_number}</div>
                                        <h4 className="font-bold text-white leading-tight line-clamp-1">{foundSong.title}</h4>
                                        <p className="text-sm text-neutral-400 line-clamp-1">{foundSong.artist}</p>
                                    </div>
                                </div>
                                
                                <input 
                                    id="singer-name-input"
                                    placeholder="Enter Singer Name..." 
                                    className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-white focus:border-violet-500 focus:outline-none" 
                                    autoFocus
                                />

                                <div className="flex gap-2 pt-2">
                                     <button 
                                        onClick={() => { setFoundSong(null); setLookupNumber(''); }}
                                        className="flex-1 py-2 rounded-lg font-bold bg-white/5 hover:bg-white/10 text-neutral-400 text-sm"
                                    >
                                        Back
                                    </button>
                                     <button 
                                        onClick={() => {
                                            const singerName = (document.getElementById('singer-name-input') as HTMLInputElement).value || "Guest";
                                            addToQueue({
                                                id: foundSong.song_number,
                                                title: foundSong.title,
                                                artist: foundSong.artist, 
                                                youtubeId: foundSong.youtube_id,
                                                duration: foundSong.duration || "00:00",
                                                singer: singerName
                                            }, singerName);
                                            // Reset
                                            setShowNumberEntry(false);
                                            setFoundSong(null);
                                            setLookupNumber('');
                                            alert(`Queued #${foundSong.song_number} for ${singerName}!`);
                                        }}
                                        className="flex-[2] py-2 rounded-lg font-bold bg-violet-600 hover:bg-violet-500 text-white text-sm"
                                    >
                                        Add to Queue
                                    </button>
                                </div>
                            </div>
                        )}
                         
                        {!foundSong && (
                            <button onClick={() => setShowNumberEntry(false)} className="w-full py-2 text-neutral-500 text-sm hover:text-white">Cancel</button>
                        )}
                    </motion.div>
                </div>
            )}

            {/* Manual Entry Modal */}
            {showManualEntry && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-neutral-900 border border-white/10 p-6 rounded-3xl w-full max-w-md shadow-2xl space-y-4"
                    >
                        <h3 className="text-xl font-bold text-white mb-2">Add Manual Entry</h3>
                        <input id="manual-title" placeholder="Song Title" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-violet-500 focus:outline-none" />
                        <input id="manual-artist" placeholder="Artist" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-violet-500 focus:outline-none" />
                        <input id="manual-singer" placeholder="Singer Name" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-violet-500 focus:outline-none" />
                        
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => setShowManualEntry(false)} className="flex-1 py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 text-neutral-400">Cancel</button>
                            <button 
                                onClick={() => {
                                    const title = (document.getElementById('manual-title') as HTMLInputElement).value;
                                    const artist = (document.getElementById('manual-artist') as HTMLInputElement).value;
                                    const singer = (document.getElementById('manual-singer') as HTMLInputElement).value;
                                    
                                    if(title && singer) {
                                        useTunrStore.getState().addToQueue({
                                            id: Math.floor(Math.random() * 10000),
                                            title,
                                            artist: artist || "Unknown Artist",
                                            singer,
                                            youtubeId: "", 
                                            duration: "00:00"
                                        }, singer);
                                        setShowManualEntry(false);
                                    } else {
                                        alert("Title and Singer are required.");
                                    }
                                }}
                                className="flex-1 py-3 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 text-white"
                            >
                                Add to Queue
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {activeTab === 'requests' && (
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                 {requests.map((req) => (
                   <div key={req.id} className="p-4 bg-neutral-900/50 rounded-xl border border-white/5 flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400 font-bold">
                          {req.singer?.[0] || 'S'}
                        </div>
                        <div>
                          <h3 className="font-medium text-white">{req.title}</h3>
                          <p className="text-sm text-neutral-500">{req.artist} • Requested by {req.singer}</p>
                        </div>
                     </div>
                     <div className="flex gap-2">
                       <button className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 text-sm">Dismiss</button>
                       <button className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium">Accept</button>
                     </div>
                   </div>
                 ))}
                 {requests.length === 0 && (
                   <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
                     <Search className="w-8 h-8 mb-2 opacity-50" />
                     <p>No pending requests</p>
                   </div>
                 )}
              </div>
            )}
          </div>

        </div>
      </main>

      <footer className="pb-6 text-center opacity-40 hover:opacity-100 transition-opacity">
         <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-500">System by</span>
            <img src="/molave-logo.png" alt="Molave Labs" className="h-5 w-auto" />
         </div>
      </footer>
    </div>
  );
}
