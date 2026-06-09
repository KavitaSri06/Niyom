import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, CRMPage } from './types';
import CRMLogin from './CRMLogin';
import ChangePassword from './ChangePassword';
import Layout from './Layout';
import Dashboard from './Dashboard';
import ClientOnboarding from './ClientOnboarding';
import ManageClients from './ManageClients';
import Portfolio from './Portfolio';
import Transactions from './Transactions';
import Reports from './Reports';
import Documents from './Documents';
import AdminDocuments from './AdminDocuments';
import MIS from './MIS';
import DSAPayout from './DSAPayout';
import DSAManagement from './DSAManagement';
import Employees from './Employees';
import Settings from './Settings';
import DealConfirmation from './DealConfirmation';

export default function CRM() {
  const [employee, setEmployee] = useState<NWEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<CRMPage>('dashboard');
  const [pageParams, setPageParams] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from('nw_employees').select('*')
          .eq('auth_user_id', session.user.id).eq('status', 'active').maybeSingle();
        setEmployee((data as NWEmployee) || null);
      }
      setLoading(false);
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'SIGNED_OUT') {
          localStorage.clear();
          sessionStorage.clear();
          window.location.replace('/crm');
        } else if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
          const { data } = await supabase
            .from('nw_employees').select('*')
            .eq('auth_user_id', session.user.id).eq('status', 'active').maybeSingle();
          setEmployee((data as NWEmployee) || null);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const navigate = (p: any, params?: Record<string, string>) => {
    setPageParams(params || {});
    if (typeof p === 'string') setPage(p as CRMPage);
    else if (p && p.page) setPage(p.page as CRMPage);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050505' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!employee) {
    return <CRMLogin onLogin={emp => { setEmployee(emp); setPage('dashboard'); }} />;
  }

  // Force password change for new employees
  if (!employee.password_changed) {
    return <ChangePassword employee={employee} onComplete={updatedEmp => setEmployee(updatedEmp)} />;
  }

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard employee={employee} onNavigate={navigate} />;
      case 'onboarding': return <ClientOnboarding employee={employee} onNavigate={navigate} />;
      case 'clients': return <ManageClients employee={employee} onNavigate={navigate} />;
      case 'portfolio': return <Portfolio employee={employee} />;
      case 'transactions': return <Transactions employee={employee} />;
      case 'reports': return <Reports employee={employee} />;
      case 'documents': return <Documents employee={employee} initialClientId={pageParams.clientId} onBack={pageParams.clientId ? () => navigate('clients') : undefined} />;
      case 'admin_documents': return isAdmin ? <AdminDocuments employee={employee} /> : <Documents employee={employee} />;
      case 'mis': return <MIS employee={employee} />;
      case 'dsa_management': return isAdmin ? <DSAManagement employee={employee} /> : <Dashboard employee={employee} onNavigate={navigate} />;
      case 'dsa_payout': return isAdmin ? <DSAPayout employee={employee} /> : <Dashboard employee={employee} onNavigate={navigate} />;
      case 'employees': return isAdmin ? <Employees employee={employee} /> : <Dashboard employee={employee} onNavigate={navigate} />;
      case 'deal_confirmation': return <DealConfirmation employee={employee} />;
      case 'settings': return <Settings employee={employee} />;
      default: return <Dashboard employee={employee} onNavigate={navigate} />;
    }
  };

  return (
    <Layout employee={employee} page={page} onNavigate={navigate}>
      {renderPage()}
    </Layout>
  );
}
