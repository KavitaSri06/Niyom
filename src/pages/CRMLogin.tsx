import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, AlertCircle, ArrowLeft, BarChart3, TrendingUp, Users, Award } from 'lucide-react';

export default function CRMLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const { data: crmUser, error: crmError } = await supabase
        .from('crm_users').select('*').eq('auth_user_id', authData.user.id).maybeSingle();

      if (crmError) throw crmError;

      if (!crmUser) {
        await supabase.auth.signOut();
        throw new Error('You are not authorized to access the CRM. Please contact your administrator.');
      }

      if ((crmUser as any).is_active === false) {
        await supabase.auth.signOut();
        throw new Error('Your account has been deactivated. Please contact your administrator.');
      }

      window.location.href = crmUser.role === 'admin' ? '/crm/admin' : '/crm/employee';
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Left Panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-gray-950 p-12 border-r border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-64 h-64 bg-accent-soft rounded-full filter blur-3xl" />
          <div className="absolute bottom-32 right-10 w-48 h-48 bg-bg-elevated rounded-full filter blur-3xl" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 bg-accent-soft rounded-xl flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-text-primary" />
          </div>
          <div>
            <p className="text-white font-bold tracking-widest text-sm" style={{ fontFamily: 'var(--font-display)' }}>NIYOM WEALTH</p>
            <p className="text-accent-soft/60 text-xs tracking-widest">DISTRIBUTION LLP</p>
          </div>
        </div>

        <div className="relative">
          <p className="text-xs font-semibold text-accent-soft uppercase tracking-widest mb-4">Employee CRM</p>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Track. Grow.<br />
            <span className="text-accent-soft">Earn more.</span>
          </h2>
          <p className="text-white/40 text-sm leading-relaxed max-w-xs">
            Manage your deals, track client relationships, and monitor your incentive performance — all in one place.
          </p>
        </div>

        <div className="relative grid grid-cols-2 gap-3">
          {[
            { icon: <Users className="w-4 h-4" />, label: 'Team Managed', value: 'All Roles' },
            { icon: <TrendingUp className="w-4 h-4" />, label: 'X Multiple', value: '10 Tiers' },
            { icon: <Award className="w-4 h-4" />, label: 'Incentives', value: 'Real-time' },
            { icon: <BarChart3 className="w-4 h-4" />, label: 'Products', value: '7 Types' },
          ].map((stat, i) => (
            <div key={i} className="bg-bg-elevated/5 border border-white/10 rounded-2xl p-4 hover:bg-bg-elevated/[0.08] transition-colors">
              <div className="text-accent-soft mb-2">{stat.icon}</div>
              <p className="text-white text-sm font-bold">{stat.value}</p>
              <p className="text-white/30 text-xs mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-950">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-accent-soft rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-text-primary" />
            </div>
            <div>
              <p className="text-white font-bold tracking-widest text-sm" style={{ fontFamily: 'var(--font-display)' }}>NIYOM WEALTH</p>
              <p className="text-accent-soft/60 text-xs tracking-widest">DISTRIBUTION LLP</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
            <p className="text-white/40 text-sm">Sign in to access your CRM dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-950/50 border border-red-900/50 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 leading-relaxed">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-bg-elevated/5 border border-white/10 text-white placeholder-white/15 pl-11 pr-4 py-3.5 rounded-2xl focus:ring-2 focus:ring-accent-soft/50 focus:border-accent-soft/30 transition-all text-sm outline-none"
                  placeholder="you@niyomwealth.com" required />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-bg-elevated/5 border border-white/10 text-white placeholder-white/15 pl-11 pr-4 py-3.5 rounded-2xl focus:ring-2 focus:ring-accent-soft/50 focus:border-accent-soft/30 transition-all text-sm outline-none"
                  placeholder="••••••••" required />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-accent-soft hover:bg-accent-soft-deep text-text-primary py-3.5 rounded-2xl font-bold transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-accent-soft/20">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-950/30 border-t-gray-950 rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5">
            <button onClick={() => window.location.href = '/'}
              className="flex items-center gap-2 text-white/25 hover:text-white/60 transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              Back to Niyom Wealth
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
