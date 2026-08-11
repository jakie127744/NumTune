'use client';

import { usePathname } from 'next/navigation';
import { Coffee } from 'lucide-react';

// Set this once you have a Ko-fi page (https://ko-fi.com/<your-name>).
// Left blank for now - the button stays hidden until it's filled in, so
// there's nothing to wire up later beyond dropping the URL in here.
const KOFI_URL = '';

// Hidden on the Stage view (the TV/projector display) - a floating "support
// us" button has no place on the screen the audience is watching.
const HIDDEN_ON = ['/stage'];

export function KofiButton() {
  const pathname = usePathname();
  if (!KOFI_URL || HIDDEN_ON.some(path => pathname?.startsWith(path))) return null;

  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-4 right-4 z-[90] flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#FF5E5B] text-white text-sm font-bold shadow-lg shadow-black/30 hover:scale-105 active:scale-95 transition-transform"
    >
      <Coffee className="w-4 h-4" />
      Support Us
    </a>
  );
}
