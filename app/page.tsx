import Link from 'next/link';
import { Mic2, Monitor, Music, Smartphone } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 font-display selection:bg-primary/30">
      
      <div className="max-w-4xl w-full space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl shadow-lg shadow-violet-500/20 mb-4">
            <img src="/off-key-logo.png" alt="Logo" className="w-10 h-10 drop-shadow-lg" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
            Off Key Karaoke
          </h1>
          <p className="text-xl text-neutral-400 max-w-xl mx-auto">
            The Digital Songbook for the Modern Stage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <Link href="/host" className="group relative p-6 bg-neutral-900/50 hover:bg-neutral-900 border border-white/5 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-2xl hover:border-violet-500/50">
            <div className="absolute top-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
                <Music className="w-6 h-6 text-violet-400" />
            </div>
            <div className="h-full flex flex-col justify-end">
                <h2 className="text-2xl font-bold text-white mb-1">Host</h2>
                <p className="text-sm text-neutral-400">Control Dashboard</p>
            </div>
            <div className="absolute inset-0 bg-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          </Link>

          <Link href="/stage" className="group relative p-6 bg-neutral-900/50 hover:bg-neutral-900 border border-white/5 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-2xl hover:border-blue-500/50">
             <div className="absolute top-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
                <Monitor className="w-6 h-6 text-blue-400" />
            </div>
            <div className="h-full flex flex-col justify-end">
                <h2 className="text-2xl font-bold text-white mb-1">Stage</h2>
                <p className="text-sm text-neutral-400">Projector View</p>
            </div>
             <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          </Link>

           <Link href="/songbook" className="group relative p-6 bg-neutral-900/50 hover:bg-neutral-900 border border-white/5 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-2xl hover:border-pink-500/50">
             <div className="absolute top-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
                <Music className="w-6 h-6 text-pink-400" />
            </div>
            <div className="h-full flex flex-col justify-end">
                <h2 className="text-2xl font-bold text-white mb-1">Library</h2>
                <p className="text-sm text-neutral-400">Manage Songbook</p>
            </div>
             <div className="absolute inset-0 bg-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          </Link>

           <Link href="/guest" className="group relative p-6 bg-neutral-900/50 hover:bg-neutral-900 border border-white/5 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-2xl hover:border-green-500/50">
             <div className="absolute top-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
                <Smartphone className="w-6 h-6 text-green-400" />
            </div>
            <div className="h-full flex flex-col justify-end">
                <h2 className="text-2xl font-bold text-white mb-1">Guest</h2>
                <p className="text-sm text-neutral-400">Mobile Request App</p>
            </div>
             <div className="absolute inset-0 bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          </Link>

        </div>
        
        <div className="flex flex-col items-center justify-center gap-4 mt-12">
             <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
                <span className="text-xs text-neutral-500 font-medium">Created by</span>
                <div className="flex items-center gap-2">
                    <img src="/molave-logo.png" alt="Molave Labs" className="h-8 w-auto" />
                    <span className="text-lg font-bold text-white tracking-widest uppercase font-display">Molave Labs</span>
                </div>
            </div>
            <div className="text-center text-xs text-neutral-600 font-mono">
                Full Stack Karaoke Management System • v0.1.0 Beta
            </div>
        </div>
      </div>
    </div>
  );
}
