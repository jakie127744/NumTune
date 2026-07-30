'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { subscribeConfirm, ConfirmRequest } from '@/lib/confirm';

export function ConfirmDialogHost() {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);

  React.useEffect(() => subscribeConfirm(setRequest), []);

  const handle = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => handle(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-white/10 p-6 shadow-2xl space-y-5"
          >
            <p className="text-white font-semibold text-base leading-snug">{request.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => handle(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handle(true)}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
