import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee } from './types';
import { fmtDate } from './utils';
import { User, Lock, Bell, CheckCircle2, AlertCircle, Eye, EyeOff, Shield } from 'lucide-react';

interface Props { employee: NWEmployee; }

const ROLE_LABELS: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', employee: 'Employee' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8A8A8A' }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input {...props}
      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none transition-all"
      style={{ background: '#050505', border: `1px solid ${focused ? '#D4AF37' : '#1E1E24'}` }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

export default function Settings({ employee }: Props) {
  const [tab, setTab] = useState<'profile' | 'security' | 'notifications'>('profile');
  const [profile, setProfile] = useState({ full_name: employee.full_name, phone: employee.phone || '' });
  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [notifications, setNotifications] = useState({ email_alerts: true, txn_alerts: true, client_alerts: true });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const notify = (msg: string, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg);
    setTimeout(() => { setSuccess(''); setError(''); }, 4000);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error: err } = await supabase.from('nw_employees').update({ full_name: profile.full_name, phone: profile.phone }).eq('id', employee.id);
    setSaving(false);
    if (err) notify(err.message, true); else notify('Profile updated successfully.');
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) { notify('Passwords do not match.', true); return; }
    if (passwords.next.length < 8) { notify('Password must be at least 8 characters.', true); return; }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: passwords.next });
    setSaving(false);
    if (err) notify(err.message, true); else { notify('Password updated.'); setPasswords({ next: '', confirm: '' }); }
  };

  const tabs = [
    { key: 'profile' as const, label: 'Profile', icon: User },
    { key: 'security' as const, label: 'Security', icon: Lock },
    { key: 'notifications' as const, label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#D4AF37' }}>Account</p>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: '#8A8A8A' }}>Manage your profile and preferences</p>
      </div>

      {/* Badge */}
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0" style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}>
          {employee.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white truncate">{employee.full_name}</p>
          <p className="text-sm mt-0.5 truncate" style={{ color: '#8A8A8A' }}>{employee.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs font-mono px-2 py-0.5 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}>
              {employee.employee_code}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}>
              {ROLE_LABELS[employee.role]}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs" style={{ color: '#8A8A8A' }}>Member since</p>
          <p className="text-sm font-medium text-white mt-0.5">{employee.joining_date ? fmtDate(employee.joining_date) : '—'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: active ? 'rgba(212,175,55,0.1)' : 'transparent', color: active ? '#D4AF37' : '#8A8A8A', border: active ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent' }}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {success && (
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {tab === 'profile' && (
        <form onSubmit={saveProfile} className="rounded-2xl p-6 space-y-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><User className="w-4 h-4" style={{ color: '#D4AF37' }} /> Personal Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name"><Input value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} /></Field>
            <Field label="Phone"><Input placeholder="+91 9876543210" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} /></Field>
            <Field label="Email"><Input value={employee.email} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} /></Field>
            <Field label="Employee Code"><Input value={employee.employee_code || ''} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} /></Field>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      )}

      {tab === 'security' && (
        <div className="space-y-5">
          <form onSubmit={savePassword} className="rounded-2xl p-6 space-y-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Lock className="w-4 h-4" style={{ color: '#D4AF37' }} /> Change Password</h3>
            {[{ key: 'next' as const, label: 'New Password' }, { key: 'confirm' as const, label: 'Confirm Password' }].map(f => (
              <Field key={f.key} label={f.label}>
                <div className="relative">
                  <Input type={showPw ? 'text' : 'password'} placeholder="Min 8 characters" value={passwords[f.key]} onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))} />
                  {f.key === 'next' && (
                    <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#8A8A8A' }}>
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </Field>
            ))}
            <div className="flex justify-end">
              <button type="submit" disabled={saving || !passwords.next} className="px-6 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
          <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Shield className="w-4 h-4" style={{ color: '#D4AF37' }} /> Account Security</h3>
            {[['Email Verified', true], ['Account Active', employee.status === 'active'], ['Password Set', employee.password_changed]].map(([label, ok]) => (
              <div key={label as string} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: '#1E1E24' }}>
                <p className="text-sm text-white">{label as string}</p>
                <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${ok ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>{ok ? 'Yes' : 'No'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="rounded-2xl p-6 space-y-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Bell className="w-4 h-4" style={{ color: '#D4AF37' }} /> Notification Preferences</h3>
          <div className="space-y-3">
            {[
              { key: 'email_alerts' as const, label: 'Email Alerts', desc: 'Receive important notifications via email' },
              { key: 'txn_alerts' as const, label: 'Transaction Alerts', desc: 'Get notified on new transactions' },
              { key: 'client_alerts' as const, label: 'Client Alerts', desc: 'Get notified on client updates' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-4 rounded-xl" style={{ background: '#050505', border: '1px solid #1E1E24' }}>
                <div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8A8A8A' }}>{item.desc}</p>
                </div>
                <button onClick={() => setNotifications(n => ({ ...n, [item.key]: !n[item.key] }))}
                  className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
                  style={{ background: notifications[item.key] ? '#D4AF37' : '#1E1E24' }}>
                  <div className="absolute w-4 h-4 bg-white rounded-full top-1 transition-all" style={{ left: notifications[item.key] ? '24px' : '4px' }} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={() => notify('Notification preferences saved.')} className="px-6 py-2.5 rounded-xl text-sm font-bold text-black" style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>Save Preferences</button>
          </div>
        </div>
      )}
    </div>
  );
}
