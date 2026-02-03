'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { useTunrStore } from '@/lib/store';

/**
 * HostGameEngine
 * 
 * This component is the "Source of Truth" for the Karaoke Session.
 * It mounts in the internal Host Layout and persists across page navigation (Dashboard <-> Songbook).
 * 
 * Responsibilities:
 * 1. Maintains the Master Audio Player (ReactPlayer).
 * 2. Broadcasts Sync Heartbeat to all clients (Stage + Host Dashboard).
 * 3. Handles Queue Progression (Auto-Next).
 * 4. Manages Recovery for playback errors.
 */

export const HostGameEngine: React.FC = () => {
    // STATE
    const currentSong = useTunrStore(s => s.currentSong);
    const isPlaying = useTunrStore(s => s.isPlaying);
    const playNext = useTunrStore(s => s.playNext);
    const syncPosition = useTunrStore(s => s.syncPosition);
    const volume = useTunrStore(s => s.volume); // Shared Volume State

    // REFS
    const elapsedRef = useRef(0);
    const [elapsed, setElapsed] = useState(0);

    // Sync Ref for interval access
    useEffect(() => {
        elapsedRef.current = elapsed;
    }, [elapsed]);

    // Heartbeat: The Pulse of the Session
    useEffect(() => {
        if (!currentSong?.id) return;
        
        // Immediate update on state change
        syncPosition(elapsedRef.current);

        const interval = setInterval(() => {
             // We broadcast frequently (333ms) when playing to keep everyone tight
             syncPosition(elapsedRef.current);
        }, isPlaying ? 333 : 1000); 
        return () => clearInterval(interval);
    }, [isPlaying, currentSong?.id]);

    if (!currentSong) return null;

    return (
        <div style={{ position: 'fixed', bottom: 0, right: 0, width: 1, height: 1, opacity: 0.01, pointerEvents: 'none', zIndex: -1 }}>
            <ReactPlayer
                key={`engine-${currentSong.id}`} // Force Remount on new song to clear buffers
                url={`https://www.youtube.com/watch?v=${currentSong.youtubeId}`}
                playing={Boolean(isPlaying)}
                volume={volume / 100} // Convert 0-100 to 0-1
                width="100%"
                height="100%"
                onEnded={() => {
                    console.log("GameEngine: Song Ended. Triggering Next.");
                    playNext();
                }}
                onProgress={(p: any) => setElapsed(p.playedSeconds)}
                onError={(e: any) => {
                    console.error("GameEngine Player Error:", e);
                    // AbortError Recovery
                    if (e && e.name === 'AbortError' && !isPlaying) {
                        console.warn("GameEngine: AbortError detected. Enforcing Pause State.");
                        // We are already paused state-wise, so strictly nothing to do, 
                        // but we could force a seek/sync if stuck.
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
    );
};
