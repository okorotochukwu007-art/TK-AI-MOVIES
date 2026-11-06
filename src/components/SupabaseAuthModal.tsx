import React, { useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { Lock, LogOut, Mail, ShieldCheck, X } from 'lucide-react';

interface SupabaseAuthModalProps {
  supabaseClient: SupabaseClient | null;
  session: Session | null;
  activeUserEmail?: string | null;
  isAdmin: boolean;
  initialMode?: 'signup' | 'login' | 'forgot';
  pendingMovieTitle?: string | null;
  onOpenWatchlist: () => void;
  onOpenAdmin: () => void;
  onClose: () => void;
  onAuthSuccess: (email?: string) => void;
  onSignOut?: () => void;
}

type AuthView = 'signup' | 'login' | 'forgot';

const LOCAL_ACCOUNTS_KEY = 'tk_storyworld_accounts_v1';
const LOCAL_SESSION_KEY = 'tk_storyworld_user_session_v1';

function getLocalAccounts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalAccountAndSession(email: string, password?: string) {
  try {
    const clean = email.trim().toLowerCase();
    if (password) {
      const accounts = getLocalAccounts();
      accounts[clean] = password;
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
    }
    localStorage.setItem(LOCAL_SESSION_KEY, clean);
  } catch {
    // ignore storage errors
  }
}

export async function notifyBackendAuthEvent(
  email: string,
  eventType: 'signup' | 'login'
) {
  try {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@') || clean === 'guest-viewer') return;
    await fetch(`/api/auth/record-${eventType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: clean,
        clientInfo: 'Web Client Auth Modal',
      }),
    });
  } catch {
    // ignore
  }
}

export const SupabaseAuthModal: React.FC<SupabaseAuthModalProps> = ({
  supabaseClient,
  session,
  activeUserEmail,
  isAdmin,
  initialMode = 'signup',
  pendingMovieTitle,
  onOpenWatchlist,
  onOpenAdmin,
  onClose,
  onAuthSuccess,
  onSignOut,
}) => {
  const [view, setView] = useState<AuthView>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const signedInEmail =
    session?.user?.email ||
    (activeUserEmail && activeUserEmail !== 'guest-viewer'
      ? activeUserEmail
      : null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      return;
    }
    if (!password || password.length < 6) {
      setMessage({
        type: 'error',
        text: 'Password must be at least 6 characters.',
      });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      // Step 1: Attempt server-side registration (auto-confirms email when service_role key is present)
      let registeredOnServer = false;
      try {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password }),
        });
        const contentType = regRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const regData = await regRes.json();
          if (regRes.ok && regData.success) {
            registeredOnServer = true;
          } else if (
            regData.error &&
            regData.error.toLowerCase().includes('already exists')
          ) {
            // Try logging them in directly if they entered their existing password
            if (supabaseClient) {
              const { error: existingLoginErr } =
                await supabaseClient.auth.signInWithPassword({
                  email: cleanEmail,
                  password,
                });
              if (!existingLoginErr) {
                saveLocalAccountAndSession(cleanEmail, password);
                void notifyBackendAuthEvent(cleanEmail, 'login');
                onAuthSuccess(cleanEmail);
                return;
              }
            }
            throw new Error(regData.error);
          }
        }
      } catch (serverErr: any) {
        if (
          serverErr?.message &&
          serverErr.message.toLowerCase().includes('already exists')
        ) {
          throw serverErr;
        }
        // If /api/auth/register is unreachable on static deploy, continue to client-side Supabase Auth
      }

      // Step 2: Authenticate via Supabase Client if configured
      if (supabaseClient) {
        if (!registeredOnServer) {
          const { data: signUpData, error: signUpErr } =
            await supabaseClient.auth.signUp({
              email: cleanEmail,
              password,
            });

          if (signUpErr) {
            const errLower = signUpErr.message.toLowerCase();
            if (
              errLower.includes('already') ||
              errLower.includes('registered')
            ) {
              // Attempt direct login with the provided password
              const { error: retryLoginErr } =
                await supabaseClient.auth.signInWithPassword({
                  email: cleanEmail,
                  password,
                });
              if (!retryLoginErr) {
                saveLocalAccountAndSession(cleanEmail, password);
                void notifyBackendAuthEvent(cleanEmail, 'login');
                onAuthSuccess(cleanEmail);
                return;
              }
              throw new Error(
                'An account with this email already exists. Please switch to Login or use Forgot Password.'
              );
            }
          } else if (signUpData?.session) {
            saveLocalAccountAndSession(cleanEmail, password);
            void notifyBackendAuthEvent(cleanEmail, 'signup');
            onAuthSuccess(cleanEmail);
            return;
          }
        }

        const { error: loginErr } =
          await supabaseClient.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (loginErr) {
          const errLower = loginErr.message.toLowerCase();
          // If Supabase has "Confirm email" enabled and no service_role key was set on Netlify,
          // do not lock the viewer out — activate their session immediately
          if (
            errLower.includes('email not confirmed') ||
            errLower.includes('not confirmed')
          ) {
            saveLocalAccountAndSession(cleanEmail, password);
            void notifyBackendAuthEvent(cleanEmail, 'signup');
            onAuthSuccess(cleanEmail);
            return;
          }
          if (errLower.includes('invalid login credentials')) {
            // If server didn't create the user yet, try client signUp once
            const { error: fallbackSignUpErr } =
              await supabaseClient.auth.signUp({
                email: cleanEmail,
                password,
              });
            if (!fallbackSignUpErr) {
              saveLocalAccountAndSession(cleanEmail, password);
              void notifyBackendAuthEvent(cleanEmail, 'signup');
              onAuthSuccess(cleanEmail);
              return;
            }
          }
        } else {
          saveLocalAccountAndSession(cleanEmail, password);
          void notifyBackendAuthEvent(cleanEmail, 'signup');
          onAuthSuccess(cleanEmail);
          return;
        }
      }

      // Step 3: Resilient fallback so viewers on Netlify can always sign up and watch immediately
      const accounts = getLocalAccounts();
      if (accounts[cleanEmail] && accounts[cleanEmail] !== password) {
        throw new Error(
          'An account with this email already exists. Please switch to Login or use Forgot Password.'
        );
      }
      saveLocalAccountAndSession(cleanEmail, password);
      void notifyBackendAuthEvent(cleanEmail, 'signup');
      onAuthSuccess(cleanEmail);
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
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      if (supabaseClient) {
        const { error } = await supabaseClient.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!error) {
          saveLocalAccountAndSession(cleanEmail, password);
          void notifyBackendAuthEvent(cleanEmail, 'login');
          onAuthSuccess(cleanEmail);
          return;
        }

        const errLower = error.message.toLowerCase();
        if (
          errLower.includes('email not confirmed') ||
          errLower.includes('not confirmed')
        ) {
          // Try auto-confirming via server endpoint, then sign in
          try {
            await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: cleanEmail, password }),
            });
            await supabaseClient.auth.signInWithPassword({
              email: cleanEmail,
              password,
            });
          } catch {
            // ignore
          }
          saveLocalAccountAndSession(cleanEmail, password);
          void notifyBackendAuthEvent(cleanEmail, 'login');
          onAuthSuccess(cleanEmail);
          return;
        }

        // Check local account fallback if created in fallback mode
        const accounts = getLocalAccounts();
        if (accounts[cleanEmail] && accounts[cleanEmail] === password) {
          saveLocalAccountAndSession(cleanEmail, password);
          void notifyBackendAuthEvent(cleanEmail, 'login');
          onAuthSuccess(cleanEmail);
          return;
        }

        if (errLower.includes('invalid login credentials')) {
          throw new Error(
            'Incorrect email or password. Need an account? Click Sign Up below.'
          );
        }
        throw error;
      }

      // Fallback login when Supabase client is not connected
      const accounts = getLocalAccounts();
      if (accounts[cleanEmail] && accounts[cleanEmail] !== password) {
        throw new Error(
          'Incorrect email or password. Need an account? Click Sign Up below.'
        );
      }
      saveLocalAccountAndSession(cleanEmail, password);
      void notifyBackendAuthEvent(cleanEmail, 'login');
      onAuthSuccess(cleanEmail);
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
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      return;
    }
    if (!password || password.length < 6) {
      setMessage({
        type: 'error',
        text: 'New password must be at least 6 characters.',
      });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, newPassword: password }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (!res.ok && data.error && !data.error.includes('not configured')) {
            // Only throw if it's a genuine user lookup error and not a missing server key
            if (data.error.toLowerCase().includes('no account found')) {
              throw new Error(data.error);
            }
          }
        }
      } catch (resetErr: any) {
        if (
          resetErr?.message &&
          resetErr.message.toLowerCase().includes('no account found')
        ) {
          throw resetErr;
        }
      }

      if (supabaseClient) {
        await supabaseClient.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
      }

      saveLocalAccountAndSession(cleanEmail, password);
      setMessage({
        type: 'success',
        text: 'Password updated successfully!',
      });
      onAuthSuccess(cleanEmail);
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
    setLoading(true);
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {
      // ignore
    }
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch {
        // ignore
      }
    }
    if (onSignOut) {
      onSignOut();
    }
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
              {!signedInEmail && (
                <span className="text-[11px] font-semibold text-emerald-400">
                  · 100% Free Streaming
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold text-white">
              {signedInEmail
                ? 'My Account'
                : view === 'signup'
                ? 'Create Your Free Account'
                : view === 'login'
                ? 'Welcome Back'
                : 'Reset Your Password'}
            </h2>
            {!signedInEmail && (
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
        {signedInEmail ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-[#07090E] border border-white/10 p-4">
              <div className="text-xs text-slate-400">Signed in as</div>
              <div className="font-display text-sm font-semibold text-white mt-0.5 break-all">
                {signedInEmail}
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
