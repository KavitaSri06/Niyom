import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee } from './types';
import { Shield, Users, BarChart3, Mail, Lock, Eye, EyeOff, ArrowRight, ChevronLeft, ArrowLeft, AlertTriangle, KeyRound, CheckCircle2, RotateCw } from 'lucide-react';

interface Props {
  onLogin: (emp: NWEmployee) => void;
}

// Multi-step forgot-password (OTP) flow:
//   fp_email -> fp_otp -> fp_password -> fp_done
type View = 'login' | 'fp_email' | 'fp_otp' | 'fp_password' | 'fp_done';

const FN_BASE = `${(import.meta as any).env?.VITE_SUPABASE_URL || ''}/functions/v1`;
const FN_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

// Password policy — must match the server (reset-password-with-otp).
function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
  };
}
function passwordValid(pw: string) {
  const c = passwordChecks(pw);
  return c.length && c.lower && c.upper && c.number;
}

// Client-side rate limiting state (session-scoped, resets on page reload)
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300; // 5 minutes

function getRateLimitState(): { attempts: number; lockedUntil: number } {
  try {
    const raw = sessionStorage.getItem('crm_login_rl');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { attempts: 0, lockedUntil: 0 };
}

function setRateLimitState(s: { attempts: number; lockedUntil: number }) {
  sessionStorage.setItem('crm_login_rl', JSON.stringify(s));
}

function recordFailedAttempt(): { locked: boolean; remaining: number } {
  const state = getRateLimitState();
  const now = Date.now();
  // Reset if lockout has expired
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
  sessionStorage.removeItem('crm_login_rl');
}

export default function CRMLogin({ onLogin }: Props) {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockoutMsg, setLockoutMsg] = useState('');
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Forgot-password (OTP) flow state ---
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [fpError, setFpError] = useState('');
  const [fpInfo, setFpInfo] = useState('');
  const [resendIn, setResendIn] = useState(0); // seconds until "Resend" is allowed
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendCountdown = (secs = 60) => {
    setResendIn(secs);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendIn(s => {
        if (s <= 1) { if (resendTimer.current) clearInterval(resendTimer.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (resendTimer.current) clearInterval(resendTimer.current); }, []);

  const resetFpState = () => {
    setOtp(''); setNewPassword(''); setConfirmPassword('');
    setFpError(''); setFpInfo(''); setShowNewPw(false);
  };

  // Check and show remaining lockout time
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

    setLoading(true);

    // Attempt sign-in
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });

    if (authErr) {
      const { locked, remaining } = recordFailedAttempt();
      if (locked) {
        setError(`Account temporarily locked after ${MAX_ATTEMPTS} failed attempts. Try again in ${Math.ceil(LOCKOUT_SECONDS / 60)} minutes.`);
      } else {
        setError(`Invalid credentials or unauthorized access.${remaining <= 2 ? ` (${remaining} attempt${remaining !== 1 ? 's' : ''} remaining)` : ''}`);
      }
      setLoading(false);
      return;
    }

    // Verify user has an active nw_employees record
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Invalid credentials or unauthorized access.');
      setLoading(false);
      return;
    }

    const { data: emp, error: empErr } = await supabase
      .from('nw_employees').select('*')
      .eq('auth_user_id', user.id).eq('status', 'active').maybeSingle();

    if (empErr || !emp) {
      // Valid auth user but not a CRM employee — sign them out immediately
      await supabase.auth.signOut();
      recordFailedAttempt();
      setError('Invalid credentials or unauthorized access.');
      setLoading(false);
      return;
    }

    // Success — clear rate limit and proceed
    clearRateLimit();
    setLoading(false);
    onLogin(emp as NWEmployee);
  };

  const callFn = async (path: string, payload: unknown) => {
    const res = await fetch(`${FN_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FN_ANON}`,
        'Apikey': FN_ANON,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  // Step 1-2: request an OTP for the entered email.
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError(''); setFpInfo('');
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFpError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await callFn('send-reset-otp', { email: cleanEmail });
      if (res.status === 429) {
        setFpError(data?.error || 'Too many requests. Please wait and try again.');
        setLoading(false);
        return;
      }
      // Enumeration-safe: always advance to the OTP screen on a normal response.
      resetFpState();
      setView('fp_otp');
      setFpInfo('If this email is registered, a 6-digit code has been sent. It expires in 5 minutes.');
      startResendCountdown(60);
    } catch {
      setFpError('Network error. Please try again.');
    }
    setLoading(false);
  };

  // Resend the OTP (same endpoint; rate-limited server-side).
  const handleResendOtp = async () => {
    if (resendIn > 0) return;
    setFpError(''); setFpInfo('');
    setLoading(true);
    try {
      const { res, data } = await callFn('send-reset-otp', { email: email.trim().toLowerCase() });
      if (res.status === 429) {
        setFpError(data?.error || 'Please wait before requesting another code.');
      } else {
        setFpInfo('A new code has been sent if the email is registered.');
        setOtp('');
        startResendCountdown(60);
      }
    } catch {
      setFpError('Network error. Please try again.');
    }
    setLoading(false);
  };

  // Step 3: verify the OTP (does not consume it).
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError(''); setFpInfo('');
    if (!/^\d{6}$/.test(otp)) { setFpError('Enter the 6-digit code.'); return; }
    setLoading(true);
    try {
      const { res, data } = await callFn('reset-password-with-otp', {
        action: 'verify', email: email.trim().toLowerCase(), otp,
      });
      if (res.ok && data?.verified) {
        setNewPassword(''); setConfirmPassword('');
        setView('fp_password');
      } else {
        setFpError(data?.error || 'Incorrect or expired code.');
      }
    } catch {
      setFpError('Network error. Please try again.');
    }
    setLoading(false);
  };

  // Step 4: set the new password (re-verifies OTP server-side, then consumes it).
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError(''); setFpInfo('');
    if (!passwordValid(newPassword)) { setFpError('Password does not meet the requirements below.'); return; }
    if (newPassword !== confirmPassword) { setFpError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const { res, data } = await callFn('reset-password-with-otp', {
        action: 'reset', email: email.trim().toLowerCase(), otp, password: newPassword,
      });
      if (res.ok && data?.success) {
        setView('fp_done');
      } else {
        // If the OTP expired/maxed during the password step, send the user back.
        setFpError(data?.error || 'Could not reset the password. Please try again.');
        if (res.status === 429 || /expired|no active code/i.test(data?.error || '')) {
          setView('fp_otp');
        }
      }
    } catch {
      setFpError('Network error. Please try again.');
    }
    setLoading(false);
  };

  const inputClass = "w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all";
  const inputStyle = { background: '#0D0D0D', border: '1px solid #1E1E24' };

  return (
    <div className="min-h-screen flex" style={{ background: '#050505' }}>
      {/* Left Panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12" style={{ background: 'linear-gradient(160deg, #0A0A0D 0%, #0f0f13 60%, #111117 100%)', borderRight: '1px solid rgba(201,184,150,0.1)' }}>
        <div className="flex items-center gap-3">
          <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-10 w-auto object-contain" />
          <div>
            <p className="font-bold text-lg leading-none" style={{ color: '#c9b896' }}>Niyom Wealth</p>
            <p className="text-xs" style={{ color: '#6B6B6B' }}>CRM Platform</p>
          </div>
        </div>
        <div className="space-y-8">
          <div>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#c9b896', letterSpacing: '0.15em' }}>Staff Portal</p>
            <h1 className="text-4xl font-bold text-white leading-tight">Manage wealth,<br />build trust.</h1>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#8A8A8A' }}>
              A unified platform for client management, portfolio tracking, and transaction processing — built for wealth professionals.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {[
              { icon: Users, label: 'Client Management', desc: 'Onboard and manage clients with full KYC tracking' },
              { icon: BarChart3, label: 'Portfolio Analytics', desc: 'Real-time portfolio views with P&L analysis' },
              { icon: Shield, label: 'Secure & Role-Based', desc: 'Each login sees only their own clients and data' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(201,184,150,0.04)', border: '1px solid rgba(201,184,150,0.1)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,184,150,0.1)' }}>
                  <Icon className="w-4 h-4" style={{ color: '#c9b896' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} />
            <p className="text-xs leading-relaxed" style={{ color: '#9A7070' }}>
              Access is restricted to authorized personnel only. All accounts are created exclusively by the system administrator. Unauthorized access attempts are logged.
            </p>
          </div>
        </div>
        <p className="text-xs" style={{ color: '#3A3A3A' }}>© 2026 Niyom Wealth. All rights reserved.</p>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <button onClick={() => { window.location.href = '/'; }}
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: '#6B6B6B' }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Website
            </button>
          </div>

          {view === 'login' && (
            <div className="space-y-8">
              <div>
                <div className="lg:hidden flex items-center gap-3 mb-8">
                  <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-9 w-auto object-contain" />
                  <p className="font-bold text-lg" style={{ color: '#c9b896' }}>Niyom Wealth</p>
                </div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#c9b896', letterSpacing: '0.15em' }}>Welcome back</p>
                <h2 className="text-3xl font-bold text-white">Sign in to CRM</h2>
                <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>Authorized personnel only</p>
              </div>

              {lockoutMsg && (
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{lockoutMsg}</span>
                </div>
              )}

              {error && !lockoutMsg && (
                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@niyomwealth.com"
                      className={inputClass} style={{ ...inputStyle, paddingLeft: '2.75rem' }}
                      onFocus={e => (e.target.style.borderColor = '#c9b896')}
                      onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                      autoComplete="email"
                      disabled={!!lockoutMsg}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                    <input type={showPw ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className={inputClass} style={{ ...inputStyle, paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                      onFocus={e => (e.target.style.borderColor = '#c9b896')}
                      onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                      autoComplete="current-password"
                      disabled={!!lockoutMsg}
                    />
                    <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#4A4A4A' }}>
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => { resetFpState(); setView('fp_email'); setError(''); }}
                    className="text-xs" style={{ color: '#c9b896' }}>
                    Forgot password?
                  </button>
                </div>
                <button type="submit" disabled={loading || !!lockoutMsg}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                  style={{ background: 'linear-gradient(135deg, #c9b896, #b5a57d)' }}>
                  {loading ? 'Signing in...' : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              <p className="text-xs text-center" style={{ color: '#3A3A3A' }}>
                Access restricted to authorized staff only. Contact your administrator for account access.
              </p>
            </div>
          )}

          {/* Shared notification blocks for the forgot-password steps */}
          {(view === 'fp_email' || view === 'fp_otp' || view === 'fp_password') && (
            <>
              {fpError && (
                <div className="mb-5 p-4 rounded-xl flex items-start gap-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{fpError}</span>
                </div>
              )}
              {fpInfo && !fpError && (
                <div className="mb-5 p-4 rounded-xl flex items-start gap-3 text-sm" style={{ background: 'rgba(201,184,150,0.06)', border: '1px solid rgba(201,184,150,0.18)', color: '#c9b896' }}>
                  <Mail className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{fpInfo}</span>
                </div>
              )}
            </>
          )}

          {/* Step 1: enter email */}
          {view === 'fp_email' && (
            <div className="space-y-8">
              <div>
                <button onClick={() => { setView('login'); setError(''); }} className="flex items-center gap-1.5 text-xs mb-6" style={{ color: '#8A8A8A' }}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#c9b896' }}>Password Reset</p>
                <h2 className="text-3xl font-bold text-white">Forgot Password</h2>
                <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>
                  Enter your registered email and we'll send you a 6-digit verification code.
                </p>
              </div>
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@niyomwealth.com"
                      className={inputClass} style={{ ...inputStyle, paddingLeft: '2.75rem' }}
                      onFocus={e => (e.target.style.borderColor = '#c9b896')}
                      onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c9b896, #b5a57d)' }}>
                  {loading ? 'Sending...' : <><span>Send Verification Code</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
              <div className="p-3 rounded-xl flex items-start gap-2.5" style={{ background: 'rgba(201,184,150,0.04)', border: '1px solid rgba(201,184,150,0.1)' }}>
                <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#c9b896' }} />
                <p className="text-xs leading-relaxed" style={{ color: '#6B6B6B' }}>
                  For your security we never confirm whether an email is registered. If it is, a code will arrive shortly.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: enter OTP */}
          {view === 'fp_otp' && (
            <div className="space-y-8">
              <div>
                <button onClick={() => { setView('fp_email'); setFpError(''); }} className="flex items-center gap-1.5 text-xs mb-6" style={{ color: '#8A8A8A' }}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Change email
                </button>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(201,184,150,0.1)', border: '1px solid rgba(201,184,150,0.2)' }}>
                  <KeyRound className="w-7 h-7" style={{ color: '#c9b896' }} />
                </div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#c9b896' }}>Verification</p>
                <h2 className="text-3xl font-bold text-white">Enter the Code</h2>
                <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>
                  We sent a 6-digit code to <span className="text-white font-medium">{email}</span>. It expires in 5 minutes.
                </p>
              </div>
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>Verification Code</label>
                  <input
                    type="text" inputMode="numeric" autoComplete="one-time-code" required
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="------"
                    className="w-full px-4 py-3.5 rounded-xl text-center text-2xl font-bold text-white outline-none transition-all tracking-[0.6em]"
                    style={{ ...inputStyle }}
                    onFocus={e => (e.target.style.borderColor = '#c9b896')}
                    onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                  />
                </div>
                <button type="submit" disabled={loading || otp.length !== 6}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c9b896, #b5a57d)' }}>
                  {loading ? 'Verifying...' : <><span>Verify Code</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
              <div className="text-center">
                <button type="button" onClick={handleResendOtp} disabled={resendIn > 0 || loading}
                  className="inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ color: '#c9b896' }}>
                  <RotateCw className="w-3.5 h-3.5" />
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: set new password */}
          {view === 'fp_password' && (() => {
            const checks = passwordChecks(newPassword);
            const reqs = [
              { ok: checks.length, label: 'At least 8 characters' },
              { ok: checks.upper, label: 'One uppercase letter' },
              { ok: checks.lower, label: 'One lowercase letter' },
              { ok: checks.number, label: 'One number' },
            ];
            return (
              <div className="space-y-8">
                <div>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(201,184,150,0.1)', border: '1px solid rgba(201,184,150,0.2)' }}>
                    <Lock className="w-7 h-7" style={{ color: '#c9b896' }} />
                  </div>
                  <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#c9b896' }}>Almost done</p>
                  <h2 className="text-3xl font-bold text-white">Create New Password</h2>
                  <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>Choose a strong password for your account.</p>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                      <input type={showNewPw ? 'text' : 'password'} required value={newPassword}
                        onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password"
                        className={inputClass} style={{ ...inputStyle, paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                        onFocus={e => (e.target.style.borderColor = '#c9b896')}
                        onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                        autoComplete="new-password"
                      />
                      <button type="button" onClick={() => setShowNewPw(s => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#4A4A4A' }}>
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8A8A8A' }}>Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
                      <input type={showNewPw ? 'text' : 'password'} required value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password"
                        className={inputClass} style={{ ...inputStyle, paddingLeft: '2.75rem' }}
                        onFocus={e => (e.target.style.borderColor = '#c9b896')}
                        onBlur={e => (e.target.style.borderColor = '#1E1E24')}
                        autoComplete="new-password"
                      />
                    </div>
                    {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                      <p className="mt-1.5 text-xs" style={{ color: '#f87171' }}>Passwords do not match.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {reqs.map(r => (
                      <p key={r.label} className="text-xs flex items-center gap-1.5" style={{ color: r.ok ? '#10B981' : '#6B6B6B' }}>
                        <CheckCircle2 className="w-3.5 h-3.5" style={{ opacity: r.ok ? 1 : 0.3 }} /> {r.label}
                      </p>
                    ))}
                  </div>
                  <button type="submit" disabled={loading || !passwordValid(newPassword) || newPassword !== confirmPassword}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #c9b896, #b5a57d)' }}>
                    {loading ? 'Updating...' : 'Reset Password'}
                  </button>
                </form>
              </div>
            );
          })()}

          {/* Step 4: success */}
          {view === 'fp_done' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: '#10B981' }} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#10B981' }}>Success</p>
                <h2 className="text-2xl font-bold text-white">Password Updated</h2>
                <p className="mt-2 text-sm" style={{ color: '#8A8A8A' }}>
                  Your password has been reset. You can now sign in with your new password.
                </p>
              </div>
              <button onClick={() => { resetFpState(); setPassword(''); setView('login'); }}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-black flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #c9b896, #b5a57d)' }}>
                <span>Back to Sign In</span><ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
