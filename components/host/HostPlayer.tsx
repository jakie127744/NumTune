import React, { useState, useEffect, useRef } from 'react';

import { motion } from 'framer-motion';
import { 
    Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Mic2, Monitor 
} from 'lucide-react';
import { useTunrStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export const HostPlayer: React.FC = () => {
    // OPTIMIZED SELECTORS
    const currentSong = useTunrStore(s => s.currentSong);
    const isPlaying = useTunrStore(s => s.isPlaying);
    const setIsPlaying = useTunrStore(s => s.setIsPlaying);
    const playNext = useTunrStore(s => s.playNext);
    const playPrevious = useTunrStore(s => s.playPrevious);
    const togglePlay = useTunrStore(s => s.togglePlay);
    const syncPosition = useTunrStore(s => s.syncPosition);
    const forceReset = useTunrStore(s => s.forceReset);

    const [elapsed, setElapsed] = useState(0);
    const elapsedRef = useRef(0);
    const [hostMuted, setHostMuted] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    
    const hasSyncedRef = useRef(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Sync Ref
    useEffect(() => {
        elapsedRef.current = elapsed;
    }, [elapsed]);

    // Reset on new song
    useEffect(() => {
        setElapsed(0);
        hasSyncedRef.current = false;
    }, [currentSong?.id]);

    // Parse duration helper
    const getDurationSeconds = (f: string) => {
        if (!f) return 0;
        const parts = f.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
    };

    const formatTime = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    // ... sync logic ... (omitted, assuming no changes needed there unless replacing whole block)
    // Actually, I can just target the definitions at the top and the ReactPlayer node separately.
    // Wait, the previous chunk only updated the footer. I need to update the `url` prop in the JSX.
    
    // Changing strategy: Only update the state def here. The next tool call will update the usage.
    // Wait, I can do it in one verify with multi_replace or carefully targeted replace.
    // I already used replace_file_content for the footer.
    // I will use this call to add state and reset logic.
    // Then I will make another call for updating the `url` prop.
    
    // Oh, I can just do MultiReplace! No, I'll stick to sequential to be safe.
    // Let's just add the state here.

    // SYNC LOGIC: IFrame Command (Cloned from Stage)
    useEffect(() => {
        const unsubscribe = useTunrStore.getState().onSync((seconds: number, playing?: boolean) => {
            setElapsed(seconds); // Restore UI Timer update
            const iframe = document.getElementById('visual-iframe-host') as HTMLIFrameElement;
            
            // 1. Instant Play/Pause Sync
            if (playing !== undefined) {
                if (iframe && iframe.contentWindow) {
                    const command = playing ? 'playVideo' : 'pauseVideo';
                    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
                }
            }

            // 2. Drift Correction
            // Since we can't easily read the IFrame's time without the API wrapper, we rely on "blind" seeks 
            // if we are just starting or if a major jump happened.
            // For closer sync, we accept that the iframe basically follows the commands.
            // But we can use the `hasSyncedRef` to force an initial snap.
            if (!hasSyncedRef.current && seconds > 1) {
                 if (iframe && iframe.contentWindow) {
                    console.log("HostPlayer: Initial Snap to " + seconds);
                    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }), '*');
                    hasSyncedRef.current = true;
                 }
            }
        });
        return () => unsubscribe();
    }, [currentSong?.id]);

    // Force Play/Pause on local state change (Backup)
    useEffect(() => {
        const iframe = document.getElementById('visual-iframe-host') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
            const command = isPlaying ? 'playVideo' : 'pauseVideo';
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
        }
    }, [isPlaying]);

    if (!currentSong) {
        // ... (Keep existing empty state)
        return (
            <div className="p-8 rounded-3xl bg-neutral-900/50 border border-white/5 text-center text-neutral-500">
                <Monitor className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="mb-4">No song playing</p>
                {useTunrStore.getState().queue.length > 0 && (
                     <button 
                        onClick={() => playNext()}
                        className="px-6 py-3 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all flex items-center gap-2 mx-auto"
                    >
                        <Play className="w-5 h-5 fill-current" />
                        Start Session
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Live Monitor Preview */}
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-neutral-900 shadow-2xl relative aspect-video group">
                <div className="absolute top-2 left-2 z-[100] flex gap-2">
                    <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">LIVE FEED</div>
                    <div className="bg-black/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1.5 backdrop-blur-md">
                        <div className={cn("w-1.5 h-1.5 rounded-full", isPlaying ? "bg-green-500 animate-pulse" : "bg-yellow-500")} />
                        <span className="text-white/80 max-w-[200px] truncate uppercase tracking-tighter">
                            {isPlaying ? 'Live' : 'Paused'}
                        </span>
                        <div className="flex gap-1 items-center border-l border-white/10 pl-1.5 ml-0.5">
                            <button onClick={() => setHostMuted(!hostMuted)} className="hover:text-primary transition-colors flex items-center gap-1 uppercase">
                                {hostMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            </button>
                            <button onClick={forceReset} className="hover:text-orange-500 transition-colors uppercase">Fix</button>
                        </div>
                    </div>
                </div>

                {/* Player Container */}
                <div id="yt-player-container" className="absolute inset-0 z-20 overflow-hidden">
                    <div className="relative w-full h-full">
                         {/* Visual Layer: Raw IFrame (Cloned from Stage) */}
                         <iframe 
                            id="visual-iframe-host"
                            key={`visual-${currentSong.id}`}
                            src={`https://www.youtube-nocookie.com/embed/${currentSong.youtubeId}?autoplay=1&mute=${hostMuted ? 1 : 0}&controls=0&enablejsapi=1&rel=0&modestbranding=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            className="absolute inset-0 w-full h-full border-0 pointer-events-none z-10"
                            allow="autoplay; encrypted-media; picture-in-picture"
                        />
                        
                        {/* Pause Overlay (Visual Verification) */}
                        {!isPlaying && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none animate-in fade-in duration-200">
                                <Pause className="w-20 h-20 text-white/50" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Controls Card */}
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

                {/* Progress Bar */}
                <div className="space-y-2 mb-6 relative z-10">
                    <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                        <motion.div 
                            className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" 
                            initial={{ width: 0 }}
                            animate={{ width: `${(elapsed / Math.max(getDurationSeconds(currentSong.duration), 1)) * 100}%` }}
                            transition={{ ease: "linear", duration: 0.5 }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-neutral-500 font-medium">
                        <span>{formatTime(elapsed)}</span>
                        <span>{currentSong.duration}</span>
                    </div>
                </div>

                {/* Buttons */}
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
        </div>
    );
};
