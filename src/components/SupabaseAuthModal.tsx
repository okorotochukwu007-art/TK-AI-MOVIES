import React, { useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { Lock, LogOut, Mail, ShieldCheck, X } from 'lucide-react';

interface SupabaseAuthModalProps {
  supabaseClient: SupabaseClient | null;
  session: Session | null;
  isAdmin: boolean;
  initialMode?: 'signup' | 'login' | 'forgot';
  pendingMovieTitle?: string | null;
  onOpenWatchlist: () => void;
  onOpenAdmin: () => void;
  onClose: () => void;
  onAuthSuccess: () => void;
}

type AuthView = 'signup' | 'login' | 'forgot';

export const SupabaseAuthModal: React.FC<SupabaseAuthModalProps> = ({
  supabaseClient,
  session,
  isAdmin,
  initialMode = 'signup',
  pendingMovieTitle,
  onOpenWatchlist,
  onOpenAdmin,
  onClose,
  onAuthSuccess,
}) => {
  const [view, setView] = useState<AuthView>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseClient) {
      setMessage({
        type: 'error',
        text: 'Authentication service is connecting. Please try again in a moment.',
      });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      const cleanEmail = email.trim().toLowerCase();

      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const regData = await regRes.json();

      if (!regRes.ok) {
        throw new Error(regData.error || 'Could not sign up.');
      }

      const { error: loginErr } = await supabaseClient.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (loginErr) {
        throw loginErr;
      }

      onAuthSuccess();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Sign up failed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseClient) {
      setMessage({
        type: 'error',
        text: 'Authentication service is connecting. Please try again in a moment.',
      });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          throw new Error(
            'Incorrect email or password. Need an account? Click Sign Up below.'
          );
        }
        throw error;
      }

      onAuthSuccess();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Login failed. Please check your details.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage(null);
      const cleanEmail = email.trim().toLowerCase();

      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, newPassword: password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not reset password.');
      }

      if (supabaseClient) {
        await supabaseClient.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
      }

      setMessage({
        type: 'success',
        text: 'Password updated successfully!',
      });
      onAuthSuccess();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Password reset failed.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabaseClient) return;
    setLoading(true);
    await supabaseClient.auth.signOut();
    setLoading(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0B0E15] border border-white/15 p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="brand-luxury-red text-xs font-black uppercase">
                TK STORYWORLD
              </span>
              {!session?.user && (
                <span className="text-[11px] font-semibold text-emerald-400">
                  · 100% Free Streaming
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold text-white">
              {session?.user
                ? 'My Account'
                : view === 'signup'
                ? 'Create Your Free Account'
                : view === 'login'
                ? 'Welcome Back'
                : 'Reset Your Password'}
            </h2>
            {!session?.user && (
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {pendingMovieTitle
                  ? `Watch "${pendingMovieTitle}" 100% FREE — just enter your email and password below to start streaming immediately.`
                  : view === 'signup'
                  ? 'All movies & series are 100% FREE to watch. No payment or card required — sign up in seconds.'
                  : view === 'login'
                  ? 'Log in with your email and password to continue watching for free.'
                  : 'Enter your email and choose a new password.'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {message && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs ${
              message.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Signed-in state vs Simple Auth Form */}
        {session?.user ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-[#07090E] border border-white/10 p-4">
              <div className="text-xs text-slate-400">Signed in as</div>
              <div className="font-display text-sm font-semibold text-white mt-0.5 break-all">
                {session.user.email}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  onClose();
                  onOpenWatchlist();
                }}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                My Watchlist & Continue Watching
              </button>

              {isAdmin && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs sm:text-sm font-bold cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Open Admin Console</span>
                </button>
              )}

              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-950/40 text-xs sm:text-sm font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Simple 2-Tab Toggle for Sign Up / Login */}
            {view !== 'forgot' && (
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#07090E] border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setView('signup');
                    setMessage(null);
                  }}
                  className={`py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    view === 'signup'
                      ? 'bg-[#E11D48] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setMessage(null);
                  }}
                  className={`py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    view === 'login'
                      ? 'bg-[#E11D48] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Login
                </button>
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={
                view === 'signup'
                  ? handleSignUp
                  : view === 'login'
                  ? handleLogin
                  : handleForgotPassword
              }
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#07090E] border border-white/15 text-sm text-white focus:outline-none focus:border-[#E11D48]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    {view === 'forgot' ? 'New Password' : 'Password'}
                  </label>
                  {view === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setView('forgot');
                        setMessage(null);
                      }}
                      className="text-xs text-[#F59E0B] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      view === 'signup'
                        ? 'Create a password (6+ characters)'
                        : view === 'forgot'
                        ? 'Enter new password (6+ characters)'
                        : 'Enter your password'
                    }
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#07090E] border border-white/15 text-sm text-white focus:outline-none focus:border-[#E11D48]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {loading
                  ? 'Please wait...'
                  : view === 'signup'
                  ? 'Sign Up & Watch Now'
                  : view === 'login'
                  ? 'Login'
                  : 'Reset Password & Login'}
              </button>
            </form>

            {/* Bottom Switch Link */}
            <div className="text-center text-xs text-slate-400 pt-1">
              {view === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setMessage(null);
                    }}
                    className="text-white font-semibold hover:underline cursor-pointer"
                  >
                    Login
                  </button>
                </>
              ) : (
                <>
                  {view === 'forgot' ? 'Remembered your password? ' : "Don't have an account? "}
                  <button
                    type="button"
                    onClick={() => {
                      setView(view === 'forgot' ? 'login' : 'signup');
                      setMessage(null);
                    }}
                    className="text-white font-semibold hover:underline cursor-pointer"
                  >
                    {view === 'forgot' ? 'Back to Login' : 'Sign Up'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
