const fs = require('fs');

function applyFixes() {
    // 1. Fix playerSlice race condition
    const playerSlicePath = 'e:/Karaoke/lib/stores/playerSlice.ts';
    let playerSlice = fs.readFileSync(playerSlicePath, 'utf8');
    const playerTarget = `    if (isPlaying && (!stoppedData || stoppedData.length === 0)) {
         console.error("Stop command affected 0 rows. Session mismatch.");
         alert("Session Control Lost: You are not the owner of this room (Ghost Mode). \\n\\nThe system will now reset to a NEW SESSION to fix this.");
         
         localStorage.removeItem('tunr_host_room_code');
         set({ isPlaying: false, currentSong: null, roomCode: "" });
         window.location.reload(); 
         return;
    }`;
    const playerReplacement = `    if (isPlaying && (!stoppedData || stoppedData.length === 0)) {
         console.warn("Song already skipped natively by another client. Ignoring to prevent double skip.");
         return;
    }`;
    
    // Fallback if line endings differ
    playerSlice = playerSlice.replace(/if \(isPlaying && \(!stoppedData \|\| stoppedData\.length === 0\)\) \{[\s\S]*?return;\r?\n    \}/m, playerReplacement);
    fs.writeFileSync(playerSlicePath, playerSlice);
    console.log("Fixed playerSlice");

    // 2. Fix app/stage/page.tsx Single ReactPlayer
    const stagePath = 'e:/Karaoke/app/stage/page.tsx';
    let stageCode = fs.readFileSync(stagePath, 'utf8');
    
    const stagePlayerLayerRegex = /\{\/\* Hybrid Stage Player: IFrame for Visuals, ReactPlayer for Events \*\/\}[\s\S]*?\{\/\* Pause Overlay \(Security Curtain\) \*\/}/m;
    const stageReplacement = `{/* Single Robust ReactPlayer for Visuals & Logic */}
                {currentSong?.youtubeId && hasInteracted && (
                    <div className="relative w-full h-full pointer-events-none">
                        <ReactPlayer 
                            ref={logicPlayerRef}
                            key={\`master-\${currentSong.youtubeId}\`}
                            url={\`https://www.youtube.com/watch?v=\${currentSong.youtubeId}\`}
                            playing={Boolean(isPlaying)}
                            muted={isMuted} // Mute is togglable on Stage
                            controls={false}
                            width="100%"
                            height="100%"
                            className="absolute inset-0 z-10"
                            config={{
                                youtube: {
                                    playerVars: { autoplay: 1, modestbranding: 1, rel: 0, start: Math.floor(currentSong.currentPosition || 0) }
                                }
                            }}
                            onEnded={() => {
                                console.log("ReactPlayer Visual ended. Starting 5-second intermission...");
                                const songEndedId = currentSong.id;
                                useTunrStore.getState().setIsPlaying(false);
                                setTimeout(() => {
                                    if (useTunrStore.getState().currentSong?.id === songEndedId) {
                                        useTunrStore.getState().playNext();
                                    }
                                }, 5000);
                            }}
                            onError={(e: any) => {
                                console.error("Stage Logic Player Error:", e);
                                const errorCode = typeof e === 'number' ? e : e?.data || e?.code;
                                if (errorCode === 101 || errorCode === 150) {
                                     setFallbackError("Error: Track restricted from embedding. Skipping in 3 seconds...");
                                     setTimeout(() => {
                                          setFallbackError(null);
                                          useTunrStore.getState().playNext();
                                     }, 3000);
                                }
                            }}
                        />
                    </div>
                )}

                {/* Pause Overlay (Security Curtain) */}`;
                
    stageCode = stageCode.replace(stagePlayerLayerRegex, stageReplacement);
    fs.writeFileSync(stagePath, stageCode);
    console.log("Fixed Stage ReactPlayer");

    // 3. Fix components/host/HostPlayer.tsx
    const hostPath = 'e:/Karaoke/components/host/HostPlayer.tsx';
    let hostCode = fs.readFileSync(hostPath, 'utf8');
    const hostPlayerLayerRegex = /\{\/\* Visual Layer: Raw IFrame \(Cloned from Stage\) \*\/\}[\s\S]*?\{\/\* Pause Overlay \(Visual Verification\) \*\/}/m;
    
    // Host relies on `hostMuted` instead of `isMuted`
    const hostReplacement = `{/* Single Robust ReactPlayer for Visuals & Logic */}
                        <ReactPlayer 
                            key={\`master-\${currentSong.youtubeId}\`}
                            url={\`https://www.youtube.com/watch?v=\${currentSong.youtubeId}\`}
                            playing={Boolean(isPlaying)}
                            muted={hostMuted}
                            controls={false}
                            width="100%"
                            height="100%"
                            className="absolute inset-0 w-full h-full pointer-events-none z-10"
                            config={{
                                youtube: {
                                    playerVars: { autoplay: 1, modestbranding: 1, rel: 0 }
                                }
                            }}
                            onEnded={() => {
                                console.log("HostPlayer Track ended. Starting 5-second intermission...");
                                const songEndedId = currentSong.id;
                                useTunrStore.getState().setIsPlaying(false);
                                setTimeout(() => {
                                    if (useTunrStore.getState().currentSong?.id === songEndedId) {
                                        useTunrStore.getState().playNext();
                                    }
                                }, 5000);
                            }}
                            onError={(e: any) => {
                                console.error("Host Logic Player Error:", e);
                                const errorCode = typeof e === 'number' ? e : e?.data || e?.code;
                                if (errorCode === 101 || errorCode === 150) {
                                     const brokenId = currentSong.youtubeId;
                                     setFallbackError("Error: Track restricted from embedding. Skipping in 3 seconds...");
                                     setTimeout(() => {
                                          setFallbackError(null);
                                          if (useTunrStore.getState().currentSong?.youtubeId === brokenId) {
                                              useTunrStore.getState().playNext();
                                          }
                                     }, 3000);
                                }
                            }}
                        />
                        
                        {/* Pause Overlay (Visual Verification) */}`;

    hostCode = hostCode.replace(hostPlayerLayerRegex, hostReplacement);
    fs.writeFileSync(hostPath, hostCode);
    console.log("Fixed Host ReactPlayer");
}

applyFixes();
