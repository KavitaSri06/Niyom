import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Eye, EyeOff, ArrowRight, ChevronLeft, AlertTriangle, CreditCard, Mail, Home, TrendingUp, X, CheckCircle2, FileText, CreditCard as IDCard, Landmark } from 'lucide-react';

interface Props {
  onLogin: (clientId: string, passwordChanged: boolean) => void;
  onInvestNow?: () => void;
}

type View = 'login' | 'forgot' | 'reset_sent';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300;

function getRateLimitState() {
  try {
    const raw = sessionStorage.getItem('client_login_rl');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { attempts: 0, lockedUntil: 0 };
}

function setRateLimitState(s: { attempts: number; lockedUntil: number }) {
  sessionStorage.setItem('client_login_rl', JSON.stringify(s));
}

function recordFailedAttempt(): { locked: boolean; remaining: number } {
  const state = getRateLimitState();
  const now = Date.now();
  if (state.lockedUntil > 0 && now >= state.lockedUntil) {
    setRateLimitState({ attempts: 1, lockedUntil: 0 });
    return { locked: false, remaining: MAX_ATTEMPTS - 1 };
  }
  const newAttempts = state.attempts + 1;
  if (newAttempts >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_SECONDS * 1000;
    setRateLimitState({ attempts: newAttempts, lockedUntil });
    return { locked: true, remaining: 0 };
  }
  setRateLimitState({ attempts: newAttempts, lockedUntil: 0 });
  return { locked: false, remaining: MAX_ATTEMPTS - newAttempts };
}

function clearRateLimit() {
  sessionStorage.removeItem('client_login_rl');
}

export default function ClientLogin({ onLogin, onInvestNow }: Props) {
  const [view, setView] = useState<View>('login');
  const [pan, setPan] = useState('');
  const [password, setPassword] = useState('');
  const [resetPan, setResetPan] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockoutMsg, setLockoutMsg] = useState('');
  const [showInterestModal, setShowInterestModal] = useState(false);
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkLockout = (): boolean => {
    const state = getRateLimitState();
    const now = Date.now();
    if (state.lockedUntil > 0 && now < state.lockedUntil) {
      const secsLeft = Math.ceil((state.lockedUntil - now) / 1000);
      setLockoutMsg(`Too many failed attempts. Try again in ${secsLeft}s.`);
      return true;
    }
    setLockoutMsg('');
    return false;
  };

  useEffect(() => {
    checkLockout();
    lockoutTimer.current = setInterval(() => {
      const state = getRateLimitState();
      const now = Date.now();
      if (state.lockedUntil > 0 && now >= state.lockedUntil) {
        clearRateLimit();
        setLockoutMsg('');
        if (lockoutTimer.current) clearInterval(lockoutTimer.current);
      } else {
        checkLockout();
      }
    }, 1000);
    return () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current); };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (checkLockout()) return;

    const panClean = pan.trim().toUpperCase();
    if (!panClean || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panClean)) {
      setError('Please enter a valid PAN number (e.g. ABCDE1234F).');
      return;
    }
    if (!password) { setError('Password is required.'); return; }

    setLoading(true);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Look up client by PAN via edge function (service role, no RLS exposure)
    let client: { client_id: string; client_email: string; password_changed: boolean } | null = null;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/client-pan-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Apikey': anonKey },
        body: JSON.stringify({ pan: panClean }),
      });
      if (res.ok) client = await res.json();
    } catch {}

    if (!client || !client.client_email) {
      const { locked, remaining } = recordFailedAttempt();
      if (locked) {
        setError(`Account temporarily locked after ${MAX_ATTEMPTS} failed attempts. Try again in ${Math.ceil(LOCKOUT_SECONDS / 60)} minutes.`);
      } else {
        setError(`Invalid PAN or password.${remaining <= 2 ? ` (${remaining} attempt${remaining !== 1 ? 's' : ''} remaining)` : ''}`);
      }
      setLoading(false);
      return;
    }

    const { data: signInData, error: authErr } = await supabase.auth.signInWithPassword({
      email: client.client_email,
      password,
    });

    if (authErr || !signInData?.user) {
      const { locked, remaining } = recordFailedAttempt();
      if (locked) {
        setError(`Account temporarily locked after ${MAX_ATTEMPTS} failed attempts. Try again in ${Math.ceil(LOCKOUT_SECONDS / 60)} minutes.`);
      } else {
        setError(`Invalid PAN or password.${remaining <= 2 ? ` (${remaining} attempt${remaining !== 1 ? 's' : ''} remaining)` : ''}`);
      }
      setLoading(false);
      return;
    }

    clearRateLimit();
    setLoading(false);
    onLogin(client.client_id, client.password_changed);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      await fetch(`${supabaseUrl}/functions/v1/secure-client-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan: resetPan.trim().toUpperCase() }),
      });
    } catch {}

    setLoading(false);
    setView('reset_sent');
  };

  return (
    <>
    {/* Interest / Invest Now modal */}
    {showInterestModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.88)' }}>
        <div className="w-full max-w-md rounded-3xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid rgba(212,175,55,0.25)' }}>
          <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #D4AF37, #B8961E, #D4AF37)' }} />
          <div className="p-7 space-y-5">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <TrendingUp className="w-6 h-6" style={{ color: '#D4AF37' }} />
              </div>
              <button onClick={() => setShowInterestModal(false)} className="p-1.5 rounded-lg transition-colors" style={{ color: '#4A4A4A' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#A8A8A8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#D4AF37' }}>Thank You for Your Interest</p>
              <h2 className="text-xl font-bold text-white">Welcome to Niyom Wealth Distribution</h2>
              <p className="text-sm leading-relaxed" style={{ color: '#8A8A8A' }}>
                We are delighted to have you explore wealth management opportunities with us. To initiate your onboarding and issuance of your unique Client Code, kindly ensure you have the following documents readily available for upload.
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Documents Required</p>
              {[
                { icon: IDCard, label: 'PAN Card Copy', desc: 'Self-attested copy of your Permanent Account Number card.' },
                { icon: FileText, label: 'Client Master List (CML)', desc: 'Obtained from your Depository Participant (DP) — confirms your demat account details.' },
                { icon: Landmark, label: 'Cancelled Cheque / Bank Statement', desc: 'Recent bank statement or a cancelled cheque leaf for account verification.' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)' }}>
                    <Icon className="w-4 h-4" style={{ color: '#D4AF37' }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{label}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#5A5A5A' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs leading-relaxed" style={{ color: '#4A4A4A' }}>
              All submitted documents are processed in strict compliance with SEBI and KYC norms. Your information remains fully confidential and secure.
            </p>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowInterestModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: '#111', color: '#6B6B6B', border: '1px solid #1E1E24' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#A8A8A8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B6B6B')}>
                Cancel
              </button>
              <button
                onClick={() => { setShowInterestModal(false); onInvestNow?.(); }}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-black flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    <div className="min-h-screen flex" style={{ background: '#050505' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-10" style={{ background: '#0B0B0F', borderRight: '1px solid #1A1A1A' }}>
        <div className="flex items-center gap-3">
          <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-10 w-auto object-contain" />
          <div>
            <p className="font-bold text-sm" style={{ color: '#c9b896' }}>Niyom Wealth</p>
            <p className="text-xs" style={{ color: '#4A4A4A' }}>Client Portal</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#D4AF37' }}>Your Wealth, At A Glance</p>
            <h2 className="text-3xl font-bold leading-tight text-white">Manage your investments securely</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: '#6B6B6B' }}>
              Access your portfolio, track your holdings, and stay updated on your financial journey with Niyom Wealth.
            </p>
          </div>
          {[
            { label: 'Secure Access', desc: 'Your PAN number is your unique login ID' },
            { label: 'Portfolio Visibility', desc: 'View your holdings and investment performance' },
            { label: 'Confidential', desc: 'All data is encrypted and accessible only by you' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: '#D4AF37' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{f.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#4A4A4A' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.1)' }}>
            <p className="text-xs" style={{ color: '#6B6B6B' }}>
              <span style={{ color: '#D4AF37' }}>Login ID:</span> Your PAN number (e.g. ABCDE1234F). Your credentials were set up by your relationship manager.
            </p>
          </div>
          <a href="/" className="flex items-center gap-2 text-xs transition-colors" style={{ color: '#4A4A4A' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
            onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
            <Home className="w-3.5 h-3.5" />
            Back to Niyom Wealth home
          </a>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">

          {view === 'login' && (
            <>
              <div>
                <div className="flex items-center gap-3 mb-6 lg:hidden">
                  <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-8 w-auto object-contain" />
                  <p className="font-bold text-sm" style={{ color: '#c9b896' }}>Niyom Wealth</p>
                </div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#D4AF37' }}>Client Portal</p>
                <h1 className="text-3xl font-bold text-white">Welcome Back</h1>
                <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>Sign in using your PAN number and password.</p>
              </div>

              {lockoutMsg && (
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{lockoutMsg}</p>
                </div>
              )}
              {error && !lockoutMsg && (
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>PAN Number</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                    <input
                      type="text"
                      value={pan}
                      onChange={e => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className="w-full py-3 rounded-xl text-sm text-white outline-none transition-all font-mono tracking-widest"
                      style={{ background: '#0D0D0D', border: '1px solid #1E1E24', paddingLeft: '2.75rem' }}
                      onFocus={e => (e.target.style.borderColor = '#D4AF37')}
                      onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                      disabled={!!lockoutMsg}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="w-full py-3 rounded-xl text-sm text-white outline-none transition-all"
                      style={{ background: '#0D0D0D', border: '1px solid #1E1E24', paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                      onFocus={e => (e.target.style.borderColor = '#D4AF37')}
                      onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                      disabled={!!lockoutMsg}
                    />
                    <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#4A4A4A' }}>
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={() => { setView('forgot'); setError(''); setResetPan(pan); }}
                    className="text-xs font-medium transition-colors" style={{ color: '#D4AF37' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#c9b896')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#D4AF37')}>
                    Forgot Password?
                  </button>
                </div>

                <button type="submit" disabled={loading || !!lockoutMsg}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-black disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                  {loading ? 'Signing in...' : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              {/* Invest Now */}
              <div className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
                <div>
                  <p className="text-sm font-bold text-white">New to Niyom Wealth?</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>Start your investment journey today. Open your account in minutes.</p>
                </div>
                <button
                  onClick={() => setShowInterestModal(true)}
                  className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)', color: '#000' }}
                >
                  <TrendingUp className="w-4 h-4" />
                  Invest Now
                </button>
              </div>

              <div className="text-center">
                <a href="/" className="inline-flex items-center gap-1.5 text-xs transition-colors" style={{ color: '#3A3A3A' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#3A3A3A')}>
                  <Home className="w-3.5 h-3.5" />
                  Back to main website
                </a>
              </div>
            </>
          )}

          {view === 'forgot' && (
            <>
              <div>
                <button onClick={() => { setView('login'); setError(''); }} className="flex items-center gap-1.5 text-xs mb-6 transition-colors" style={{ color: '#6B6B6B' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#A8A8A8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6B6B6B')}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to login
                </button>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#D4AF37' }}>Password Reset</p>
                <h1 className="text-2xl font-bold text-white">Reset Your Password</h1>
                <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>Enter your PAN number. A reset link will be sent to your registered email.</p>
              </div>

              {error && (
                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>{error}</div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>PAN Number</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                    <input
                      type="text"
                      value={resetPan}
                      onChange={e => setResetPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className="w-full py-3 rounded-xl text-sm text-white outline-none transition-all font-mono tracking-widest"
                      style={{ background: '#0D0D0D', border: '1px solid #1E1E24', paddingLeft: '2.75rem' }}
                      onFocus={e => (e.target.style.borderColor = '#D4AF37')}
                      onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                    />
                  </div>
                </div>
                <button type="submit" disabled={loading || resetPan.length !== 10}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-black disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                  {loading ? 'Sending...' : <><Mail className="w-4 h-4" /><span>Send Reset Link</span></>}
                </button>
              </form>

              <div className="p-4 rounded-xl text-xs" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.1)', color: '#6B6B6B' }}>
                For security reasons, we never confirm whether a PAN is registered. If your PAN is in our system, you will receive a reset email.
              </div>
            </>
          )}

          {view === 'reset_sent' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Mail className="w-8 h-8" style={{ color: '#10B981' }} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#10B981' }}>Check Your Email</p>
                <h1 className="text-2xl font-bold text-white">Reset Link Sent</h1>
                <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>
                  If your PAN is registered, reset instructions have been sent to your registered email address.
                </p>
              </div>
              <button onClick={() => { setView('login'); setError(''); }}
                className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: '#111', color: '#A8A8A8', border: '1px solid #1E1E24' }}>
                Back to Login
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
    </>
  );
}
