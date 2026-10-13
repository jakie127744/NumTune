'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mic2, Monitor, Music, Smartphone } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        // Auto-open the login modal as requested if not logged in.
        // Anonymous sessions (created the moment a host starts a session)
        // count as "logged in" here so returning to Home doesn't nag an
        // active host with a sign-in prompt every time.
        setIsAuthModalOpen(true);
      }
    };
    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 font-display selection:bg-primary/30">
      
      <div className="max-w-4xl w-full space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/off-key-logo.png" alt="Logo" className="h-20 sm:h-28 w-auto object-contain drop-shadow-lg" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
            Off Key Karaoke
          </h1>
          <p className="text-xl text-neutral-400 max-w-xl mx-auto">
            The Digital Songbook for the Modern Stage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <button 
            onClick={() => setIsAuthModalOpen(true)}
            className="group relative p-6 bg-neutral-900/50 hover:bg-neutral-900 border border-white/5 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-2xl hover:border-violet-500/50 text-left"
          >
            <div className="absolute top-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
                <Music className="w-6 h-6 text-violet-400" />
            </div>
            <div className="h-full flex flex-col justify-end">
                <h2 className="text-2xl font-bold text-white mb-1">Host</h2>
                <p className="text-sm text-neutral-400">Control Dashboard</p>
            </div>
            <div className="absolute inset-0 bg-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          </button>

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

        {/* How it works - first-time visitors otherwise land on four tiles
            with no idea which one is theirs or that guests need a room code. */}
        <section className="space-y-6">
          <h2 className="text-center text-sm font-bold uppercase tracking-[0.3em] text-neutral-500">How it works</h2>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Music,
                color: 'text-violet-400',
                title: 'Host starts a party',
                body: 'Tap Host and sign in. You get a 4-character room code and a QR code to share, and you run the queue from the dashboard.',
              },
              {
                icon: Monitor,
                color: 'text-blue-400',
                title: 'Open Stage on the TV',
                body: "Open Stage on the TV - over HDMI, screen casting, or the TV's browser. That's where the karaoke videos play for everyone.",
              },
              {
                icon: Smartphone,
                color: 'text-green-400',
                title: 'Guests join & pick songs',
                body: "Guests scan the host's QR code, or tap Guest and type the room code. No app, no sign-up - just enter a name and pick a song.",
              },
            ].map((step, i) => (
              <li key={step.title} className="relative p-5 rounded-2xl bg-neutral-900/50 border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs font-black">{i + 1}</span>
                  <step.icon className={`w-5 h-5 ${step.color}`} />
                  <h3 className="font-bold">{step.title}</h3>
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="text-center text-sm text-neutral-500">
            Song not in the library? Hosts can paste any YouTube karaoke link to add it.
          </p>
        </section>

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

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </div>
  );
}
