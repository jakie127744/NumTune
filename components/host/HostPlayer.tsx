import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Mic2, Monitor, RotateCcw 
} from 'lucide-react';
import { useTunrStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

/**
 * HostPlayer
 * 
 * The dashboard's visible preview player.
 * Now uses the same timestamp-based sync architecture as the Stage.
 */
export const HostPlayer: React.FC = () => {
    // OPTIMIZED SELECTORS
    const currentSong = useTunrStore(s => s.currentSong);
    const isPlaying = useTunrStore(s => s.isPlaying);
    const playNext = useTunrStore(s => s.playNext);
    const playPrevious = useTunrStore(s => s.playPrevious);
    const togglePlay = useTunrStore(s => s.togglePlay);
    const forceReset = useTunrStore(s => s.forceReset);
    const hostAudioMuted = useTunrStore(s => s.hostAudioMuted);
    const setHostAudioMuted = useTunrStore(s => s.setHostAudioMuted);
    const syncNudge = useTunrStore(s => s.syncNudge);
    const setSyncNudge = useTunrStore(s => s.setSyncNudge);

    const [hostMuted, setHostMuted] = useState(true);
    const [fallbackError, setFallbackError] = useState<string | null>(null);
    
    // ============================================================
    // TIMESTAMP-BASED SYNC (Host Preview)
    // ============================================================
    const ytPlayerRef = useRef<any>(null);
    const playbackStateRef = useRef<{
        offset: number;
        startedAt: number;
        isPlaying: boolean;
    }>({ offset: 0, startedAt: 0, isPlaying: false });

    const getCorrectTime = () => {
        const state = playbackStateRef.current;
        if (!state.isPlaying) return state.offset;
        const elapsed = (Date.now() - state.startedAt) / 1000;
        return state.offset + elapsed;
    };

    const syncToCorrectTime = () => {
        const player = ytPlayerRef.current;
        if (!player || typeof player.seekTo !== 'function') return;
        
        const correctTime = getCorrectTime();
        const state = playbackStateRef.current;
        
        // Seek if we are loaded
        if (correctTime > 1) {
            player.seekTo(correctTime, true);
        }
        
        // Sync play/pause state
        if (state.isPlaying) {
            if (typeof player.playVideo === 'function') player.playVideo();
        } else {
            if (typeof player.pauseVideo === 'function') player.pauseVideo();
        }
    };

    // Load API & Create Player
    useEffect(() => {
        if (!currentSong?.youtubeId) return;

        // Ensure YT API is loaded
        if (!(window as any).YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }

        const createPlayer = () => {
            if (!(window as any).YT || !(window as any).YT.Player) {
                setTimeout(createPlayer, 200);
                return;
            }

            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch {}
                ytPlayerRef.current = null;
            }

            // Create player in designated container
            const containerId = 'yt-host-preview-container';
            ytPlayerRef.current = new (window as any).YT.Player(containerId, {
                videoId: currentSong.youtubeId,
                playerVars: {
                    autoplay: 1,
                    mute: hostMuted ? 1 : 0,
                    controls: 0,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    origin: window.location.origin,
                },
                events: {
                    onReady: () => {
                        syncToCorrectTime();
                    },
                    onError: (e: any) => {
                        console.error("Host Preview Error:", e.data);
                        // 101/150 = Embedding restricted
                        if (e.data === 101 || e.data === 150) {
                            setFallbackError("Track restricted from embedding. Skipping...");
                            setTimeout(() => {
                                setFallbackError(null);
                                useTunrStore.getState().playNext();
                            }, 3000);
                        }
                    }
                }
            });
        };
        createPlayer();

        return () => {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch {}
                ytPlayerRef.current = null;
            }
        };
    }, [currentSong?.id, hostMuted]);

    // Realtime Sync Subscription (matches Stage implementation)
    useEffect(() => {
        if (!currentSong?.queueId) return;

        const fetchState = async () => {
            const { data } = await supabase.from('queue').select('current_position_seconds, is_playing, last_sync_at').eq('id', currentSong.queueId).single();
            if (data) {
                playbackStateRef.current = {
                    offset: data.current_position_seconds || 0,
                    startedAt: data.last_sync_at ? new Date(data.last_sync_at).getTime() : Date.now(),
                    isPlaying: data.is_playing
                };
                syncToCorrectTime();
            }
        };
        fetchState();

        const channel = supabase.channel(`host-preview-sync:${currentSong.queueId}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'queue', 
                filter: `id=eq.${currentSong.queueId}` 
            }, (payload) => {
                const newData = payload.new as any;
                playbackStateRef.current = {
                    offset: newData.current_position_seconds || 0,
                    startedAt: newData.last_sync_at ? new Date(newData.last_sync_at).getTime() : Date.now(),
                    isPlaying: newData.is_playing
                };
                syncToCorrectTime();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [currentSong?.id]);

    // Drift Correction (2s interval)
    useEffect(() => {
        const interval = setInterval(() => {
            const player = ytPlayerRef.current;
            if (!player || typeof player.getCurrentTime !== 'function' || !playbackStateRef.current.isPlaying) return;
            
            const correctTime = getCorrectTime();
            const drift = Math.abs(player.getCurrentTime() - correctTime);
            if (drift > 2) {
                console.log("Host preview drift correction:", drift.toFixed(1), "s");
                player.seekTo(correctTime, true);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    if (!currentSong) {
        return (
            <div className="p-8 rounded-3xl bg-neutral-900/50 border border-white/5 text-center text-neutral-500">
                <Monitor className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="mb-4 text-sm uppercase tracking-widest font-bold">No song playing</p>
                {useTunrStore.getState().queue.length > 0 && (
                     <button 
                        onClick={() => playNext()}
                        className="px-6 py-3 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all flex items-center gap-2 mx-auto shadow-lg shadow-violet-500/20"
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
            {/* Live Monitor Preview Case */}
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-neutral-900 shadow-2xl relative aspect-video group">
                {/* Status Badges */}
                <div className="absolute top-2 left-2 z-[100] flex gap-2">
                    <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded animate-pulse shadow-lg shadow-red-500/50">LIVE FEED</div>
                    <div className="bg-black/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1.5 backdrop-blur-md">
                        <div className={cn("w-1.5 h-1.5 rounded-full", isPlaying ? "bg-green-500 animate-pulse" : "bg-yellow-500")} />
                        <span className="text-white/80 uppercase tracking-tighter">
                            {isPlaying ? 'Live' : 'Paused'}
                        </span>
                        <div className="flex gap-1 items-center border-l border-white/10 pl-1.5 ml-0.5">
                            <button 
                                onClick={() => setHostMuted(!hostMuted)} 
                                title={hostMuted ? "Unmute Preview" : "Mute Preview"}
                                className="hover:text-violet-400 transition-colors"
                            >
                                {hostMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            </button>
                            <button 
                                onClick={forceReset} 
                                title="Force Resync All Screens"
                                className="hover:text-orange-500 transition-colors uppercase"
                            >
                                <RotateCcw className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Player Container */}
                <div className="absolute inset-0 z-20 overflow-hidden">
                    {/* Error Display Overlay */}
                    <AnimatePresence>
                        {fallbackError && (
                            <motion.div 
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="absolute inset-x-0 top-10 flex justify-center z-50"
                            >
                                <div className="bg-red-600/90 text-white px-6 py-3 rounded-full font-bold shadow-2xl backdrop-blur-md flex items-center gap-3 border border-white/20">
                                     <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                                     {fallbackError}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="relative w-full h-full">
                        {/* Unified Visual Layer (YT IFrame API target) */}
                        <div id="yt-host-preview-container" className="absolute inset-0 w-full h-full border-0 pointer-events-none z-10" />
                        
                        {/* Pause Visual State */}
                        {!isPlaying && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none animate-in fade-in duration-300">
                                <Pause className="w-16 h-16 text-white/30" />
                            </div>
                        )}
                        
                        {/* Interactive Blockers (ensure preview isn't clickable) */}
                        <div className="absolute inset-0 z-30" />
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
                <PlayerProgressBar duration={currentSong.duration} id={currentSong.id} />

                {/* Main Action Buttons */}
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex flex-col gap-1">
                        <button 
                            onClick={() => setHostAudioMuted(!hostAudioMuted)}
                            className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all", hostAudioMuted ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-white/5 text-neutral-400 border border-white/10 hover:bg-white/10")}
                        >
                            {hostAudioMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            Host Audio {hostAudioMuted ? 'Muted' : 'On'}
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <button onClick={playPrevious} className="p-3 text-neutral-400 hover:text-white transition-colors group/back">
                            <SkipBack className="w-6 h-6 group-hover/back:-translate-x-0.5 transition-transform" />
                        </button>
                        
                        <button 
                            onClick={togglePlay}
                            title={isPlaying ? "Pause" : "Play"}
                            className="w-14 h-14 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                        >
                            {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-1" />}
                        </button>
                        
                        <button onClick={playNext} className="p-3 text-neutral-400 hover:text-white transition-colors group/skip">
                            <SkipForward className="w-6 h-6 group-hover/skip:translate-x-0.5 transition-transform" />
                        </button>
                    </div>

                    {/* Sync Nudge Control */}
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2 bg-black/40 p-1 rounded-full border border-white/5">
                            <button 
                                onClick={() => setSyncNudge(syncNudge - 0.1)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-all text-xs"
                            >
                                -
                            </button>
                            <span className={cn("text-[9px] font-black w-10 text-center uppercase tracking-tighter", syncNudge === 0 ? "text-neutral-600" : "text-violet-400")}>
                                {syncNudge > 0 ? '+' : ''}{syncNudge.toFixed(1)}s
                            </span>
                            <button 
                                onClick={() => setSyncNudge(syncNudge + 0.1)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-all text-xs"
                            >
                                +
                            </button>
                        </div>
                        <span className="text-[8px] text-neutral-600 font-bold uppercase tracking-widest mr-2">Sync Nudge</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

/**
 * Progress Bar Component
 * Listens to the local sync heartbeat for smooth UI updates
 */
const PlayerProgressBar = ({ duration, id }: { duration: string, id: number }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        setElapsed(0);
    }, [id]);

    useEffect(() => {
        const unsubscribe = useTunrStore.getState().onSync((seconds: number) => {
            setElapsed(seconds);
        });
        return () => unsubscribe();
    }, []);

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

    const total = Math.max(getDurationSeconds(duration), 1);
    const percent = (elapsed / total) * 100;

    return (
        <div className="space-y-2 mb-6 relative z-10">
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]" 
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ ease: "linear", duration: 0.3 }}
                />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500 font-bold uppercase tracking-tighter">
                <span>{formatTime(elapsed)}</span>
                <span>{duration}</span>
            </div>
        </div>
    );
};
