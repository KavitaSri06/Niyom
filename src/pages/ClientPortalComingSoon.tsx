import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Bell, Sparkles, ShieldCheck, Smartphone, BarChart2 } from 'lucide-react';

interface Props { onBack: () => void; }

const FEATURES = [
  { icon: BarChart2,    title: 'Portfolio Dashboard',   desc: 'Real-time view of your investments and returns' },
  { icon: ShieldCheck,  title: 'Secure Document Vault', desc: 'Access and manage your KYC documents safely' },
  { icon: Smartphone,   title: 'Mobile First',          desc: 'Seamless experience across all your devices' },
  { icon: Bell,         title: 'Smart Alerts',          desc: 'Instant notifications on portfolio changes' },
];

export default function ClientPortalComingSoon({ onBack }: Props) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleNotify = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#050505', fontFamily: 'inherit' }}>
      {/* Top bar */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5" style={{ borderBottom: '1px solid rgba(201,184,150,0.1)' }}>
        <div className="flex items-center gap-3">
          <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-9 w-auto object-contain" />
          <span className="font-bold text-base" style={{ color: '#c9b896' }}>Niyom Wealth</span>
        </div>
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: '#8A8A8A' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#c9b896')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8A8A8A')}>
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </button>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* Animated badge */}
        <div className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '0ms' }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider mb-8"
            style={{ background: 'rgba(201,184,150,0.08)', border: '1px solid rgba(201,184,150,0.2)', color: '#c9b896' }}>
            <Clock className="w-3.5 h-3.5" />
            Coming Soon
          </div>
        </div>

        {/* Animated graphic */}
        <div className={`relative mb-10 transition-all duration-700 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
          style={{ transitionDelay: '100ms' }}>
          {/* Outer glow rings */}
          <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(201,184,150,0.04)', animationDuration: '3s' }} />
          <div className="absolute inset-[-16px] rounded-full" style={{ background: 'rgba(201,184,150,0.04)', border: '1px solid rgba(201,184,150,0.08)' }} />
          <div className="absolute inset-[-32px] rounded-full" style={{ background: 'rgba(201,184,150,0.02)', border: '1px solid rgba(201,184,150,0.05)' }} />

          {/* Central icon */}
          <div className="relative w-28 h-28 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1a1810 0%, #0f0e0b 100%)', border: '1px solid rgba(201,184,150,0.25)', boxShadow: '0 0 60px rgba(201,184,150,0.12)' }}>
            <Sparkles className="w-12 h-12" style={{ color: '#c9b896' }} />
          </div>
        </div>

        <div className={`max-w-lg transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '200ms' }}>
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Client Portal<br />
            <span style={{ color: '#c9b896' }}>In the Works</span>
          </h1>
          <p className="text-base leading-relaxed" style={{ color: '#8A8A8A' }}>
            We're building a powerful, secure portal exclusively for our clients — where you can track your investments, access documents, and stay informed in real time.
          </p>
        </div>

        {/* Notify form */}
        <div className={`mt-10 w-full max-w-md transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '300ms' }}>
          {submitted ? (
            <div className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-sm font-semibold"
              style={{ background: 'rgba(201,184,150,0.08)', border: '1px solid rgba(201,184,150,0.2)', color: '#c9b896' }}>
              <ShieldCheck className="w-4 h-4" />
              You're on the list! We'll notify you at launch.
            </div>
          ) : (
            <form onSubmit={handleNotify} className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email for early access"
                className="flex-1 px-4 py-3 rounded-xl text-sm text-white outline-none"
                style={{ background: '#0D0D0D', border: '1px solid rgba(201,184,150,0.15)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(201,184,150,0.4)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(201,184,150,0.15)')}
              />
              <button type="submit"
                className="px-5 py-3 rounded-xl text-sm font-bold text-black flex-shrink-0 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #c9b896, #b5a57d)' }}>
                Notify Me
              </button>
            </form>
          )}
        </div>

        {/* Feature grid */}
        <div className={`mt-16 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '400ms' }}>
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4 p-5 rounded-2xl text-left"
              style={{ background: '#0B0B0F', border: '1px solid rgba(201,184,150,0.08)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(201,184,150,0.08)' }}>
                <Icon className="w-4 h-4" style={{ color: '#c9b896' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6B6B6B' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs" style={{ color: '#3A3A3A', borderTop: '1px solid rgba(201,184,150,0.06)' }}>
        © 2026 Niyom Wealth Management. All rights reserved.
      </footer>
    </div>
  );
}
