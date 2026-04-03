'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { useTunrStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

const ReactPlayerAny = ReactPlayer as any;

/**
 * HostGameEngine
 * 
 * Source of Truth for the Karaoke Session.
 * 
 * Responsibilities:
 * 1. Maintains the Master Audio Player (ReactPlayer).
 * 2. Broadcasts LOCAL Sync Heartbeat (for Host UI progress bar).
 * 3. Writes TIMESTAMP + OFFSET to DB on state changes only.
 * 4. Handles Queue Progression (Auto-Next).
 */

export const HostGameEngine: React.FC = () => {
    const currentSong = useTunrStore(s => s.currentSong);
    const isPlaying = useTunrStore(s => s.isPlaying);
    const playNext = useTunrStore(s => s.playNext);
    const syncPosition = useTunrStore(s => s.syncPosition);
    const volume = useTunrStore(s => s.volume);

    const elapsedRef = useRef(0);
    const [elapsed, setElapsed] = useState(0);
    const lastDbWriteRef = useRef(0);

    // Keep ref in sync with state
    useEffect(() => {
        elapsedRef.current = elapsed;
        // Expose on window for togglePlay/setIsPlaying to read
        (window as any).__hostElapsed = elapsed;
    }, [elapsed]);

    // LOCAL heartbeat: broadcast position to Host UI components (progress bar)
    // This does NOT write to DB — just local events.
    useEffect(() => {
        if (!currentSong?.id) return;
        
        syncPosition(elapsedRef.current);

        const interval = setInterval(() => {
             syncPosition(elapsedRef.current);
        }, isPlaying ? 333 : 1000); 
        return () => clearInterval(interval);
    }, [isPlaying, currentSong?.id]);


    if (!currentSong) return null;

    return (
        <div style={{ position: 'fixed', bottom: 0, right: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0.01, pointerEvents: 'none', zIndex: -1 }}>
            <div style={{ width: 320, height: 180 }}>
            <ReactPlayerAny
                key={`engine-${currentSong.id}`}
                url={`https://www.youtube.com/watch?v=${currentSong.youtubeId}`}
                playing={Boolean(isPlaying)}
                volume={useTunrStore.getState().hostAudioMuted ? 0 : volume / 100}
                width="100%"
                height="100%"
                onEnded={() => {
                    console.log("GameEngine: Song Ended. Triggering Next.");
                    playNext();
                }}
                onProgress={(p: any) => {
                    if (Math.floor(p.playedSeconds) % 10 === 0 && p.playedSeconds > 0) {
                        console.log('ENGINE_PROGRESS:', Math.floor(p.playedSeconds), 's');
                    }
                    setElapsed(p.playedSeconds);
                }}
                onError={(e: any) => {
                    console.error("GameEngine Player Error:", e);
                    if (e && e.name === 'AbortError' && !isPlaying) {
                        console.warn("GameEngine: AbortError detected. Enforcing Pause State.");
                    }
                }}
                config={{
                    youtube: {
                        playerVars: { 
                            playsinline: 1, 
                            origin: typeof window !== 'undefined' ? window.location.origin : '',
                            autoplay: 1,
                        }
                    }
                } as any}
                progressInterval={100}
            />
            </div>
        </div>
    );
};
