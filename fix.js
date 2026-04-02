const fs = require('fs');

function fixHost() {
    const file = 'e:/Karaoke/components/host/HostPlayer.tsx';
    let content = fs.readFileSync(file, 'utf8');
    const target = '                                 }}\r\n                            />';
    const target2 = '                                 }}\n                            />';
    
    const replacement = `                                 }}\n                                 onEnded={() => {\n                                     console.log("Track ended. Starting 5-second intermission...");\n                                     const songEndedId = currentSong.id;\n                                     useTunrStore.getState().setIsPlaying(false);\n                                     setTimeout(() => {\n                                         if (useTunrStore.getState().currentSong?.id === songEndedId) {\n                                             useTunrStore.getState().playNext();\n                                         }\n                                     }, 5000);\n                                 }}\n                            />`;

    if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(file, content);
        console.log("Host done - CRLF");
    } else if (content.includes(target2)) {
        content = content.replace(target2, replacement);
        fs.writeFileSync(file, content);
        console.log("Host done - LF");
    } else {
        console.log("Host target not found");
    }
}

function fixStage() {
    const file = 'e:/Karaoke/app/stage/page.tsx';
    let content = fs.readFileSync(file, 'utf8');
    const target = '                                }}\r\n                                // Removed onEnded={playNext} to prevent stage from advancing queue\r\n                            />';
    const target2 = '                                }}\n                                // Removed onEnded={playNext} to prevent stage from advancing queue\n                            />';
    
    const replacement = `                                }}\n                                onEnded={() => {\n                                     console.log("Track ended. Starting 5-second intermission...");\n                                     const songEndedId = currentSong.id;\n                                     useTunrStore.getState().setIsPlaying(false);\n                                     setTimeout(() => {\n                                         if (useTunrStore.getState().currentSong?.id === songEndedId) {\n                                             useTunrStore.getState().playNext();\n                                         }\n                                     }, 5000);\n                                }}\n                            />`;

    if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(file, content);
        console.log("Stage done - CRLF");
    } else if (content.includes(target2)) {
        content = content.replace(target2, replacement);
        fs.writeFileSync(file, content);
        console.log("Stage done - LF");
    } else {
        console.log("Stage target not found");
    }
}

fixHost();
fixStage();
