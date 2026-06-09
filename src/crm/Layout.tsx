import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWAlert, CRMPage } from './types';
import {
  LayoutDashboard, UserPlus, Users, PieChart, ArrowLeftRight,
  FileText, UserCog, Settings, LogOut, Bell, ChevronRight, X, Home,
  FolderOpen, Shield, BarChart3, Wallet, Handshake, ClipboardList,
} from 'lucide-react';

interface Props {
  children: React.ReactNode;
  page: CRMPage;
  onNavigate: (page: CRMPage) => void;
  employee: NWEmployee;
}

const NAV = [
  { key: 'dashboard' as CRMPage,        label: 'Dashboard',         icon: LayoutDashboard },
  { key: 'onboarding' as CRMPage,       label: 'Client Onboarding', icon: UserPlus },
  { key: 'deal_confirmation' as CRMPage, label: 'Deal Confirmation', icon: ClipboardList },
  { key: 'clients' as CRMPage,          label: 'Manage Clients',    icon: Users },
  { key: 'portfolio' as CRMPage,        label: 'Portfolio',         icon: PieChart },
  { key: 'transactions' as CRMPage,     label: 'Transactions',      icon: ArrowLeftRight },
  { key: 'reports' as CRMPage,          label: 'Reports',           icon: FileText },
  { key: 'mis' as CRMPage,             label: 'MIS Report',        icon: BarChart3 },
  { key: 'dsa_management' as CRMPage,   label: 'DSA Management',    icon: Handshake, adminOnly: true },
  { key: 'dsa_payout' as CRMPage,      label: 'DSA Payout',        icon: Wallet, adminOnly: true },
  { key: 'documents' as CRMPage,        label: 'Documents',         icon: FolderOpen },
  { key: 'admin_documents' as CRMPage,  label: 'Document Vault',    icon: Shield, adminOnly: true },
  { key: 'employees' as CRMPage,        label: 'Employees',         icon: UserCog, adminOnly: true },
  { key: 'settings' as CRMPage,         label: 'Settings',          icon: Settings },
];

export default function Layout({ children, page, onNavigate, employee }: Props) {
  const [alerts, setAlerts] = useState<NWAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';
  const unread = alerts.filter(a => !a.read).length;

  useEffect(() => {
    supabase.from('nw_alerts').select('*')
      .eq('employee_id', employee.id).eq('read', false)
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setAlerts(data || []));
  }, [employee.id]);

  const markAllRead = async () => {
    await supabase.from('nw_alerts').update({ read: true }).eq('employee_id', employee.id).eq('read', false);
    setAlerts([]);
  };

  const navItems = NAV.filter(n => !n.adminOnly || isAdmin);

  const goHome = () => {
    window.location.href = '/';
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand logo */}
      <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(201,184,150,0.15)' }}>
        <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-9 w-auto object-contain flex-shrink-0" />
        <div className="overflow-hidden">
          <p className="font-bold text-sm leading-none truncate" style={{ color: '#c9b896' }}>Niyom Wealth</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#6B6B6B' }}>CRM Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ key, label, icon: Icon }) => {
          const active = page === key;
          return (
            <button key={key} onClick={() => { onNavigate(key); setMobileOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? 'rgba(201,184,150,0.1)' : 'transparent',
                color: active ? '#c9b896' : '#6B6B6B',
                border: active ? '1px solid rgba(201,184,150,0.15)' : '1px solid transparent',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = '#A8A8A8'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = '#6B6B6B'; (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
            </button>
          );
        })}

        {/* Divider */}
        <div className="my-2" style={{ borderTop: '1px solid rgba(201,184,150,0.08)' }} />

        {/* Back to Home */}
        <button onClick={goHome}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ color: '#6B6B6B', border: '1px solid transparent' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#c9b896'; (e.currentTarget as HTMLElement).style.background = 'rgba(201,184,150,0.06)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6B6B6B'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
          <Home className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">Back to Website</span>
        </button>
      </nav>

      {/* Employee card */}
      <div className="px-3 pb-4" style={{ borderTop: '1px solid rgba(201,184,150,0.1)' }}>
        <div className="mt-4 p-3 rounded-xl flex items-center gap-3" style={{ background: '#0D0D0D', border: '1px solid #1E1E24' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'rgba(201,184,150,0.15)', color: '#c9b896' }}>
            {employee.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden min-w-0">
            <p className="text-xs font-semibold text-white truncate">{employee.full_name}</p>
            <p className="text-xs truncate" style={{ color: '#4A4A4A' }}>{employee.employee_code}</p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); localStorage.clear(); sessionStorage.clear(); window.location.replace('/crm'); }} className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: '#4A4A4A' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#050505' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0" style={{ background: '#0B0B0F', borderRight: '1px solid #1A1A1A' }}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col" style={{ background: '#0B0B0F', borderRight: '1px solid #1A1A1A' }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: '#0B0B0F', borderBottom: '1px solid #1A1A1A' }}>
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 rounded-lg" style={{ color: '#8A8A8A' }} onClick={() => setMobileOpen(true)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div>
              <p className="text-white font-bold text-sm">{NAV.find(n => n.key === page)?.label || 'Dashboard'}</p>
              <p className="text-xs" style={{ color: '#4A4A4A' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Alerts bell */}
            <div className="relative">
              <button onClick={() => setShowAlerts(s => !s)}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors relative"
                style={{ background: '#0D0D0D', border: '1px solid #1E1E24', color: '#8A8A8A' }}>
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold text-black"
                    style={{ background: '#c9b896' }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {showAlerts && (
                <div className="absolute right-0 top-12 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden" style={{ background: '#0D0D0D', border: '1px solid #1E1E24' }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #1E1E24' }}>
                    <p className="text-sm font-bold text-white">Notifications</p>
                    <div className="flex items-center gap-2">
                      {unread > 0 && <button onClick={markAllRead} className="text-xs" style={{ color: '#c9b896' }}>Mark all read</button>}
                      <button onClick={() => setShowAlerts(false)} style={{ color: '#4A4A4A' }}><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {alerts.length === 0 ? (
                      <p className="text-sm text-center py-8" style={{ color: '#4A4A4A' }}>No new notifications</p>
                    ) : alerts.map(a => (
                      <div key={a.id} className="px-4 py-3" style={{ borderBottom: '1px solid #1A1A1A' }}>
                        <p className="text-xs font-semibold text-white">{a.title}</p>
                        {a.message && <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>{a.message}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Role badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#0D0D0D', border: '1px solid #1E1E24' }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: 'rgba(201,184,150,0.15)', color: '#c9b896' }}>
                {employee.full_name[0].toUpperCase()}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold text-white leading-none">{employee.full_name.split(' ')[0]}</p>
                <p className="text-xs mt-0.5 capitalize" style={{ color: '#4A4A4A' }}>{employee.role.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
