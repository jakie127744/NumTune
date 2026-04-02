import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'react-qr-code';
import { Printer, Download } from 'lucide-react';

interface ConnectQRProps {
  roomCode: string;
  onClose: () => void;
}

export const ConnectQR: React.FC<ConnectQRProps> = ({ roomCode, onClose }) => {
  const qrRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    // Add margin and text area
    canvas.width = 400;
    canvas.height = 500;
    
    img.onload = () => {
        if (!ctx) return;
        
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw Logo Border
        ctx.strokeStyle = "#8b5cf6";
        ctx.lineWidth = 12;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        
        // Draw Text
        ctx.fillStyle = "black";
        ctx.font = "bold 40px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Off Key Karaoke", canvas.width / 2, 60);
        
        // Draw Image
        ctx.drawImage(img, 50, 100, 300, 300);
        
        // Draw Room Code
        ctx.fillStyle = "#8b5cf6";
        ctx.font = "bold 60px sans-serif";
        ctx.fillText(roomCode, canvas.width / 2, 460);

        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `OffKey_Barcode_${roomCode}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={onClose}>
        <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="p-8 bg-white text-black rounded-3xl flex flex-col items-center text-center space-y-6 shadow-[0_0_50px_rgba(255,255,255,0.15)] max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
        >
        <div className="bg-white p-4 rounded-2xl shadow-inner border border-neutral-100" ref={qrRef}>
            <QRCode value={`${window.location.origin}/guest?room=${roomCode}`} size={180} />
        </div>
        <div>
            <h3 className="font-black text-2xl tracking-tight mb-2">Join the Party!</h3>
            <p className="text-neutral-500">Scan to join room <span className="font-bold text-black border-2 border-black/10 px-1.5 py-0.5 rounded bg-neutral-100">{roomCode}</span></p>
        </div>
        <div className="flex w-full gap-2">
            <button 
               onClick={handleDownload}
               className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-bold transition-all"
            >
               <Download className="w-4 h-4" /> Save Barcode
            </button>
        </div>
        <button onClick={onClose} className="text-sm font-bold text-neutral-400 hover:text-black transition-colors">
            Close
        </button>
        </motion.div>
    </div>
  );
};
