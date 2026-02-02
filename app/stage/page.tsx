'use client';

import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize, User, ListMusic, Music, Monitor } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any;

import { useTunrStore } from '@/lib/store';

export default function MainStage() {
  const { queue, currentSong, isPlaying, setIsPlaying, fetchQueue, subscribeToQueue, playNext, roomCode, setRoomCode, syncLatency, syncNudge, setSyncNudge } = useTunrStore();
  const [hasInteracted, setHasInteracted] = React.useState(false);
  const [tempCode, setTempCode] = React.useState('');
  const [syncLogs, setSyncLogs] = React.useState<string[]>([]);

  const addLog = (msg: string) => {
    setSyncLogs(prev => [msg, ...prev].slice(0, 5));
  };

  const lastResetRef = React.useRef(0);
  const logicPlayerRef = React.useRef<any>(null);

  React.useEffect(() => {
    fetchQueue();
    subscribeToQueue();

    // ELITE SYNC: Direct Broadcast Monitor
    const unsubscribe = useTunrStore.getState().onSync((seconds: number, playing?: boolean) => {
        if (!hasInteracted) return;
        
        const iframe = document.getElementById('visual-iframe-stage') as HTMLIFrameElement;
        const currentIsPlaying = useTunrStore.getState().isPlaying;
        const currentNudge = useTunrStore.getState().syncNudge;
        const latencySec = (useTunrStore.getState().syncLatency || 0) / 1000;
        
        // Compensate for network travel time + user's manual nudge (Phase Alignment)
        const realTime = seconds + latencySec + (currentNudge / 1000); 

        // 1. Instant Play/Pause Sync & State Correction
        if (playing !== undefined) {
            if (playing !== currentIsPlaying) {
                addLog(`State Sync: ${playing ? 'PLAY' : 'PAUSE'}`);
                setIsPlaying(playing);
            }
            
            // Re-force IFrame state precisely on every pulse to prevent "Zombie" players
            if (iframe && iframe.contentWindow) {
                const command = playing ? 'playVideo' : 'pauseVideo';
                iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
            }
        }

        // 2. High-Precision Snap (100ms tolerance)
        const player = logicPlayerRef.current;
        if (player && typeof player.getCurrentTime === 'function' && typeof player.seekTo === 'function') {
            const currentPos = player.getCurrentTime();
            const drift = Math.abs(currentPos - realTime);

            if (drift > 0.1 || currentPos < 0.2) {
                addLog(`SNAP: ${(drift * 1000).toFixed(0)}ms drift`);
                player.seekTo(realTime);
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [realTime, true] }), '*');
                }
            }
        }
    });

    return () => unsubscribe();
  }, [roomCode, hasInteracted]);


  // Sync Reset Trigger (Hard Reset for skipping/restarting)
  React.useEffect(() => {
    if (!currentSong || !hasInteracted) return;
    if (currentSong.resetTrigger && currentSong.resetTrigger > lastResetRef.current) {
        lastResetRef.current = currentSong.resetTrigger;
        addLog("RESET TRIGGERED");
        const iframe = document.getElementById('visual-iframe-stage') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [0, true] }), '*');
        }
        if (logicPlayerRef.current && typeof logicPlayerRef.current.seekTo === 'function') {
            logicPlayerRef.current.seekTo(0);
        }
    }
  }, [currentSong?.resetTrigger, hasInteracted]);

  // Sync Pause/Play with Visual IFrame
  React.useEffect(() => {
    if (!hasInteracted) return;
    const iframe = document.getElementById('visual-iframe-stage') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
        const command = isPlaying ? 'playVideo' : 'pauseVideo';
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
    }
  }, [isPlaying, currentSong?.id, hasInteracted]);
  
  const nextSong = queue.length > 0 ? queue[0] : null;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#0c0811] text-white font-display">
      {/* Background Gradient */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,#191022_0%,#0c0811_100%)] pointer-events-none" />

      {/* Room Entry Overlay */}
      {!roomCode && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[#0c0811] backdrop-blur-xl">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md p-10 rounded-[40px] bg-white/5 border border-white/10 shadow-2xl text-center space-y-8"
              >
                  <div className="space-y-2">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
                        <Monitor className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight">Sync Stage</h1>
                    <p className="text-white/40 text-sm">Enter the 4-digit code from the Host dashboard</p>
                  </div>

                  <div className="relative group">
                      <input 
                        type="text"
                        maxLength={4}
                        value={tempCode}
                        onChange={(e) => setTempCode(e.target.value.toUpperCase())}
                        placeholder="----"
                        className="w-full bg-black/40 border-2 border-white/5 rounded-2xl px-6 py-5 text-4xl font-black text-center tracking-[0.5em] text-primary focus:border-primary/50 focus:outline-none transition-all placeholder:text-white/5"
                      />
                  </div>

                  <button 
                    disabled={tempCode.length < 4}
                    onClick={() => {
                        setRoomCode(tempCode);
                    }}
                    className="w-full py-5 rounded-2xl bg-primary text-black font-black text-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 disabled:scale-100 shadow-[0_20px_40px_rgba(var(--primary-rgb),0.3)]"
                  >
                    JOIN SESSION
                  </button>
              </motion.div>
          </div>
      )}

      {/* User Interaction Overlay for Audio */}
      {roomCode && !hasInteracted && (
          <div 
            onClick={() => { setHasInteracted(true); setIsPlaying(true); }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 cursor-pointer backdrop-blur-md"
          >
              <div className="text-center space-y-6 max-w-md animate-in fade-in zoom-in duration-500">
                  <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mx-auto border-2 border-primary animate-pulse">
                        <Play className="w-10 h-10 text-primary fill-primary" />
                  </div>
                  <div>
                      <h1 className="text-4xl font-bold mb-2">Connect Audio</h1>
                      <p className="text-white/60 text-lg">Click anywhere to start the low-latency performance stream.</p>
                  </div>
              </div>
          </div>
      )}

      {/* Top Navigation Bar */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-10 py-6 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-4 text-white/80">
          <div className="w-6 h-6 text-primary">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.57829 8.57829C5.52816 11.6284 3.451 15.5145 2.60947 19.7452C1.76794 23.9758 2.19984 28.361 3.85056 32.3462C5.50128 36.3314 8.29667 39.7376 11.8832 42.134C15.4698 44.5305 19.6865 45.8096 24 45.8096C28.3135 45.8096 32.5302 44.5305 36.1168 42.134C39.7033 39.7375 42.4987 36.3314 44.1494 32.3462C45.8002 28.361 46.2321 23.9758 45.3905 19.7452C44.549 15.5145 42.4718 11.6284 39.4217 8.57829L24 24L8.57829 8.57829Z" fill="currentColor"></path>
            </svg>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Off Key <span className="text-primary font-normal ml-2">Karaoke</span></h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
        {/* Connection Indicator removed as it's now in the 'Sync Health' monitor */}
          </div>
        </div>
      </header>

      {/* Main Video Area */}
      <main className="relative flex-1 flex items-center justify-center p-8 z-10">
          <div className="relative w-full h-full bg-black rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
                {/* Fallback Display */}
                {!currentSong?.youtubeId && (
                    <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center opacity-50 z-0 bg-[url('https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&q=80')] bg-cover">
                         <div className="text-center space-y-4">
                            <Music className="w-16 h-16 text-primary/40 mx-auto" />
                            <p className="text-xl font-medium text-white/40">Waiting for first singer...</p>
                         </div>
                    </div>
                )}

                {/* Hybrid Stage Player: IFrame for Visuals, ReactPlayer for Events */}
                {currentSong?.youtubeId && hasInteracted && (
                    <div className="relative w-full h-full">
                        {/* Visual Layer: Raw IFrame (Highly Reliable) */}
                        <iframe 
                            id="visual-iframe-stage"
                            key={`visual-${currentSong.youtubeId}-${hasInteracted}`}
                            src={`https://www.youtube-nocookie.com/embed/${currentSong.youtubeId}?autoplay=1&mute=0&controls=0&enablejsapi=1&rel=0&modestbranding=1&start=${Math.floor(currentSong.currentPosition || 0)}&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            className="absolute inset-0 w-full h-full border-0 pointer-events-none z-10"
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                        />

                        {/* Logic Layer: Hidden ReactPlayer (Handles Auto-Next) - MUST BE MUTED TO PREVENT ECHO */}
                        <div className="opacity-0 pointer-events-none absolute -top-10 -left-10 w-1 h-1 overflow-hidden">
                            <ReactPlayer 
                                ref={logicPlayerRef}
                                key={`logic-${currentSong.youtubeId}`}
                                url={`https://www.youtube.com/watch?v=${currentSong.youtubeId}`}
                                playing={Boolean(isPlaying)}
                                muted={true}
                                // Removed onEnded={playNext} to prevent stage from advancing queue
                            />
                        </div>
                        
                        {/* Security Curtain & Branding: Shows when paused/stopped */}
                        {!isPlaying && (
                            <div className="absolute inset-0 z-30 bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center pointer-events-none p-10 text-center space-y-8 animate-in fade-in duration-1000">
                                <div className="space-y-4">
                                     <img src="/molave-logo.png" alt="Molave Labs" className="w-24 h-24 mx-auto mb-6 opacity-80 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
                                     <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-violet-400 via-primary to-orange-400 tracking-tighter drop-shadow-2xl">
                                        Off Key Karaoke
                                     </h1>
                                     <p className="text-2xl md:text-3xl font-medium text-white/50 tracking-widest uppercase">
                                        Ignite the Stage
                                     </p>
                                </div>
                                
                                <div className="absolute bottom-12 opacity-40">
                                    <p className="text-sm font-bold tracking-[0.3em] uppercase text-white/40">
                                        Created by Molave Labs
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
          </div>

          {/* Current Song Info Overlay */}
          {currentSong && (
             <div className="absolute top-16 left-16 z-20 animate-in fade-in slide-in-from-left duration-700">
               <div className="flex flex-col gap-1">
                 <h3 className="text-5xl font-bold text-white drop-shadow-2xl">{currentSong.title}</h3>
                 <p className="text-white/90 text-3xl font-medium drop-shadow-xl">{currentSong.artist}</p>
               </div>
             </div>
          )}
      </main>

      {/* Bottom Banner Area */}
      <footer className="absolute bottom-0 left-0 right-0 z-10 p-10 pointer-events-none">
        <div className="flex items-end justify-between">
          {/* Current Singer */}
          {currentSong && (
            <div className="flex items-center gap-3 bg-[#0c0811]/90 backdrop-blur-2xl border border-white/10 p-2 pr-6 rounded-full pointer-events-auto shadow-2xl">
                <div 
                className="w-10 h-10 rounded-full bg-center bg-cover ring-2 ring-primary/30" 
                style={{ backgroundImage: `url("${currentSong.thumbnailUrl || 'https://via.placeholder.com/150'}")` }}
                />
                <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-widest text-primary font-bold">On Stage</span>
                <span className="text-lg font-bold">{currentSong.singer}</span>
                </div>
            </div>
          )}

          {/* Next Up */}
          {nextSong && (
            <div className="flex items-stretch gap-3 rounded-2xl bg-primary/10 backdrop-blur-2xl border border-primary/20 p-1.5 pl-4 pointer-events-auto shadow-2xl max-w-[400px]">
                <div className="flex flex-col justify-center flex-1">
                <div className="flex items-center gap-2">
                    <ListMusic className="w-4 h-4 text-primary" />
                    <p className="text-primary text-[8px] font-bold uppercase tracking-widest">Next Up</p>
                </div>
                <p className="text-white text-base font-bold leading-tight mt-0.5">{nextSong.singer}</p>
                <p className="text-white/50 text-xs truncate mt-0.5">{nextSong.title}</p>
                </div>
                <div 
                className="w-16 h-16 bg-center bg-cover rounded-xl shrink-0" 
                style={{ backgroundImage: `url("${nextSong.thumbnailUrl || 'https://via.placeholder.com/150'}")` }}
                />
            </div>
          )}
        </div>
      </footer>
      
      {/* Sync Nudge & Health Controls */}
      <div className="absolute top-28 right-10 flex flex-col items-end gap-3 z-30 group/nudge">
          {/* Main Monitor */}
          <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-inner">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-black">Sync Health</span>
                </div>
                <div className="w-px h-3 bg-white/10 mx-1" />
                <span className={`text-[10px] font-bold ${syncLatency > 300 ? 'text-amber-500' : 'text-green-500/80'}`}>
                    {syncLatency}ms delay
                 </span>
              </div>
          </div>

          {/* Manual Phase Alignment (Nudge) */}
          <div className="flex flex-col items-end gap-2 p-4 rounded-[28px] bg-black/40 backdrop-blur-xl border border-white/5 opacity-0 group-hover/nudge:opacity-100 transition-all duration-300 translate-x-4 group-hover/nudge:translate-x-0">
             <span className="text-[8px] font-black uppercase tracking-widest text-primary/60 mb-1">Phase Alignment</span>
             <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSyncNudge(syncNudge - 50)}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-all active:scale-90"
                >
                  -
                </button>
                <div className="flex flex-col items-center min-w-[60px]">
                   <span className="text-lg font-black font-mono text-primary leading-none">{syncNudge > 0 ? `+${syncNudge}` : syncNudge}</span>
                   <span className="text-[8px] uppercase font-bold text-white/20">ms</span>
                </div>
                <button 
                  onClick={() => setSyncNudge(syncNudge + 50)}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-all active:scale-90"
                >
                  +
                </button>
             </div>
             <button 
                onClick={() => setSyncNudge(0)}
                className="text-[8px] uppercase font-bold text-white/30 hover:text-white/60 transition-colors mt-1"
             >
               Reset Nudge
             </button>
          </div>
      </div>

      {/* Connection Indicator removed as it's now in the header */}
      
      {/* Sync Debug Console */}
      <div className="absolute bottom-28 left-10 z-[100] space-y-1 pointer-events-none">
          {syncLogs.map((log, i) => (
             <motion.div 
               key={`${log}-${i}`}
               initial={{ opacity: 0, x: -10 }}
               animate={{ opacity: 1 - (i * 0.2), x: 0 }}
               className="bg-black/60 backdrop-blur-md px-3 py-1 rounded border border-white/5 text-[10px] font-mono text-primary/80"
             >
                {log}
             </motion.div>
          ))}
      </div>
    </div>
  );
}

