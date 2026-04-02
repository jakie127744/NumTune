'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2, Music } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTunrStore } from '@/lib/store';

export default function AuthPage() {
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        // Redirect if already fully logged in (not anon)
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user && !session.user.is_anonymous) {
                router.push('/host');
            }
        };
        checkUser();
    }, [router]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                
                // Immediately pull updated queue/room logic
                await useTunrStore.getState().ensureSession();
                router.push('/host');
                
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                
                alert("Account created successfully! You can now log in.");
                setIsLogin(true);
            }
        } catch (error: any) {
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-violet-500/30 font-display flex flex-col justify-center items-center p-4">
            
            <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.15)_0%,rgba(0,0,0,0)_50%)] pointer-events-none" />

            <div className="w-full max-w-md z-10">
                <div className="flex flex-col items-center mb-10">
                    <div className="p-3 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.4)] mb-6">
                        <Music className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-center">
                        Off Key <span className="text-violet-400">Karaoke</span>
                    </h1>
                    <p className="text-neutral-500 font-medium mt-2">Claim your permanent stage.</p>
                </div>

                <div className="bg-neutral-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl">
                    <form onSubmit={handleAuth} className="space-y-5">
                        <h2 className="text-2xl font-bold mb-6">
                            {isLogin ? "Welcome Back" : "Create Account"}
                        </h2>

                        {errorMsg && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                {errorMsg}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-violet-400 transition-colors">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    placeholder="Host Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-black/40 border-2 border-white/5 focus:border-violet-500/50 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder:text-neutral-600 focus:outline-none transition-all"
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-violet-400 transition-colors">
                                    <Lock className="w-5 h-5" />
                                </div>
                                <input
                                    type="password"
                                    required
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-black/40 border-2 border-white/5 focus:border-violet-500/50 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder:text-neutral-600 focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="w-full py-4 mt-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600 text-white font-black text-lg transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                            {isLogin ? "Sign In" : "Register"}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setErrorMsg('');
                            }}
                            className="text-sm text-neutral-400 hover:text-violet-400 font-bold transition-colors"
                        >
                            {isLogin ? "Don't have an account? Sign up" : "Already host? Sign in"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
