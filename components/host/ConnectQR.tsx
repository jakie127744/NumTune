import React from 'react';
import { motion } from 'framer-motion';
import QRCode from 'react-qr-code';

interface ConnectQRProps {
  roomCode: string;
  onClose: () => void;
}

export const ConnectQR: React.FC<ConnectQRProps> = ({ roomCode, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={onClose}>
        <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="p-8 bg-white text-black rounded-3xl flex flex-col items-center text-center space-y-6 shadow-[0_0_50px_rgba(255,255,255,0.15)] max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
        >
        <div className="bg-white p-4 rounded-2xl shadow-inner border border-neutral-100">
            <QRCode value={`${window.location.origin}/guest?room=${roomCode}`} size={180} />
        </div>
        <div>
            <h3 className="font-black text-2xl tracking-tight mb-2">Join the Party!</h3>
            <p className="text-neutral-500">Scan to join room <span className="font-bold text-black border-2 border-black/10 px-1.5 py-0.5 rounded bg-neutral-100">{roomCode}</span></p>
        </div>
        <button onClick={onClose} className="text-sm font-bold text-neutral-400 hover:text-black transition-colors">
            Close
        </button>
        </motion.div>
    </div>
  );
};
