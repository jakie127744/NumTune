import React from 'react';
import { motion } from 'framer-motion';
import { Music, ChevronUp, ChevronDown, Trash2, ListMusic, UserPlus } from 'lucide-react';
import { Song } from '@/lib/store';
import { cn } from '@/lib/utils';

interface QueueListProps {
  queue: Song[];
  onRemove: (queueId: number) => void;
  onMove: (queueId: number, direction: 'up' | 'down') => void;
  onOpenNumberEntry: () => void;
  onOpenManualEntry: () => void;
}

export const QueueList: React.FC<QueueListProps> = ({ 
  queue, 
  onRemove, 
  onMove, 
  onOpenNumberEntry, 
  onOpenManualEntry 
}) => {
  if (queue.length === 0) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10 text-neutral-500 min-h-[300px]">
            <Music className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-lg font-medium mb-1">Queue is empty</p>
            <p className="text-sm opacity-60 max-w-[200px]">Add songs using the buttons below or scan the QR code to join.</p>
            
            <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-sm px-4">
                    <button 
                    onClick={onOpenNumberEntry}
                    className="py-4 border-2 border-dashed border-violet-500/30 bg-violet-500/10 rounded-2xl text-violet-300 hover:border-violet-500 hover:text-white hover:bg-violet-500 transition-all flex flex-col items-center justify-center gap-2 font-bold"
                    >
                    <ListMusic className="w-6 h-6" />
                    <span className="text-sm">By Number</span>
                    </button>
                <button 
                    onClick={onOpenManualEntry}
                    className="py-4 border-2 border-dashed border-neutral-800 rounded-2xl text-neutral-500 hover:border-white/20 hover:text-neutral-300 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-2 font-medium"
                >
                    <UserPlus className="w-6 h-6" />
                    <span className="text-sm">Manual</span>
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col">
      {/* List */}
      <div className="space-y-1 pb-4">
        {queue.map((song, index) => (
            <motion.div 
            key={song.queueId}
            layout // Smooth reordering animation
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-2xl group transition-all border border-transparent hover:border-white/5"
            >
            <div className="text-neutral-600 font-bold w-6 text-center text-sm">{index + 1}</div>
            
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-white truncate leading-tight">{song.title}</h3>
                <p className="text-neutral-400 text-xs truncate font-medium">{song.artist}</p>
            </div>
            
            <div className="flex items-center gap-4">
                {/* Singer Badge */}
                <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-violet-200 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20 truncate max-w-[100px]">
                        {song.singer}
                    </div>
                </div>

                {/* Reorder Controls */}
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    disabled={index === 0}
                    onClick={(e) => { e.stopPropagation(); if (song.queueId) onMove(song.queueId, 'up'); }}
                    className="p-1 text-neutral-500 hover:text-white disabled:opacity-30 transition-colors hover:bg-white/10 rounded"
                >
                    <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button 
                    disabled={index === queue.length - 1}
                    onClick={(e) => { e.stopPropagation(); if (song.queueId) onMove(song.queueId, 'down'); }}
                    className="p-1 text-neutral-500 hover:text-white disabled:opacity-30 transition-colors hover:bg-white/10 rounded"
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                </button>
                </div>

                <div className="h-8 w-px bg-white/5" />

                <button 
                    onClick={(e) => { e.stopPropagation(); if (song.queueId) onRemove(song.queueId); }}
                    className="p-2 hover:bg-red-500/20 rounded-xl text-neutral-600 hover:text-red-400 transition-all group/trash"
                    title="Remove from queue"
                >
                    <Trash2 className="w-4 h-4 group-hover/trash:scale-110 transition-transform" />
                </button>
            </div>
            </motion.div>
        ))}
      </div>

      {/* Buttons at bottom if queue exists */}
      <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-neutral-900 to-transparent grid grid-cols-2 gap-3 mt-auto">
        <button 
            onClick={onOpenNumberEntry}
            className="py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors border border-white/5"
        >
            <ListMusic className="w-4 h-4" />
            Add by Number
        </button>
        <button 
            onClick={onOpenManualEntry}
            className="py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors border border-white/5"
        >
            <UserPlus className="w-4 h-4" />
            Manual Add
        </button>
      </div>
    </div>
  );
};
