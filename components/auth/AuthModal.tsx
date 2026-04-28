'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2, Music, ChevronDown, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTunrStore } from '@/lib/store';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const router = useRouter();
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user && !session.user.is_anonymous) {
                // If already logged in, just go to host
                router.push('/host');
                onClose();
            }
        };
        checkUser();
    }, [isOpen, router, onClose]);

    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        setErrorMsg('');
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) {
            setErrorMsg(error.message);
            setGoogleLoading(false);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                await useTunrStore.getState().ensureSession();
                router.push('/host');
                onClose();
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                alert('Account created! Check your email to confirm, then sign in.');
                setIsLogin(true);
            }
        } catch (error: any) {
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md relative">
                {/* Close Button */}
                <button 
                    onClick={onClose}
                    className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Card */}
                <div className="bg-neutral-900 border border-white/10 p-8 rounded-[2rem] shadow-2xl space-y-5">
                    
                    {/* Logo / Brand */}
                    <div className="flex flex-col items-center mb-4">
                        <div className="p-3 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.4)] mb-4">
                            <Music className="w-6 h-6 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold">Host Sign In</h2>
                        <p className="text-neutral-500 text-sm font-medium mt-1 text-center">Enter your credentials to manage the stage.</p>
                    </div>

                    {errorMsg && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                            {errorMsg}
                        </div>
                    )}

                    {/* Google OAuth Button */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={googleLoading}
                        className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-white text-neutral-900 font-black text-base hover:bg-neutral-100 disabled:opacity-60 transition-all shadow-lg hover:shadow-xl"
                    >
                        {googleLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        )}
                        {googleLoading ? 'Redirecting…' : 'Continue with Google'}
                    </button>

                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-neutral-500 font-bold uppercase tracking-widest">or</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowEmailForm(v => !v)}
                        className="w-full flex items-center justify-between text-sm text-neutral-400 hover:text-violet-400 font-bold transition-colors"
                    >
                        <span>Sign in with Email & Password</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showEmailForm ? 'rotate-180' : ''}`} />
                    </button>

                    {showEmailForm && (
                        <form onSubmit={handleAuth} className="space-y-4 pt-1 animate-in slide-in-from-top-2 duration-300">
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

                            <button
                                type="submit"
                                disabled={loading || !email || !password}
                                className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600 text-white font-black text-base transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                                {isLogin ? 'Sign In' : 'Register'}
                            </button>

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }}
                                    className="text-sm text-neutral-400 hover:text-violet-400 font-bold transition-colors"
                                >
                                    {isLogin ? "Don't have an account? Sign up" : "Already a host? Sign in"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
