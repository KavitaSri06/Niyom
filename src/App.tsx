import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Landing } from './pages/Landing';
import { Services } from './pages/Services';
import { Learning } from './pages/Learning';
import News from './pages/News';
import MFResearch from './pages/MFResearch';
import Calculator from './pages/Calculator';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { Dashboard } from './pages/Dashboard';
import { KYCForm } from './pages/KYCForm';
import { AdminKYC } from './pages/AdminKYC';
import { UnlistedShares } from './pages/UnlistedShares';
import OrderPlacement from './pages/OrderPlacement';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfUse } from './pages/TermsOfUse';
import { RiskDisclaimer } from './pages/RiskDisclaimer';
import { MutualFundsLead } from './pages/MutualFundsLead';
import { PrimaryBondsLead } from './pages/PrimaryBondsLead';
import { FixedDepositsLead } from './pages/FixedDepositsLead';
import { InsuranceLead } from './pages/InsuranceLead';
import CRMLogin from './pages/CRMLogin';
import EmployeeDashboard from './pages/EmployeeDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AddDeal from './pages/AddDeal';
import CRM from './crm/CRM';
import ClientLogin from './pages/ClientLogin';
import ClientChangePassword from './pages/ClientChangePassword';
import ClientPortal from './pages/ClientPortal';
import PublicOnboarding from './pages/PublicOnboarding';
import PublicDealView from './pages/PublicDealView';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<'landing' | 'services' | 'learning' | 'news' | 'mfresearch' | 'calculator' | 'unlisted' | 'bonds' | 'login' | 'signup' | 'dashboard' | 'kyc' | 'admin' | 'order-placement' | 'privacy' | 'terms' | 'risk' | 'mutual-funds' | 'primary-bonds' | 'fixed-deposits' | 'insurance' | 'crm-login' | 'crm-employee' | 'crm-admin' | 'crm-add-deal' | 'crm-new' | 'client-portal' | 'client-login'>('landing');
  const [showAuth, setShowAuth] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // null = unknown, true = public client, false = CRM employee (don't redirect to dashboard)
  const [isPublicClient, setIsPublicClient] = useState<boolean | null>(null);
  // Client portal state
  const [clientPortalId, setClientPortalId] = useState<string | null>(null);
  const [clientPasswordChanged, setClientPasswordChanged] = useState(false);
  // Public secure deal-confirmation link token (/deal/<token>)
  const [dealToken, setDealToken] = useState<string | null>(null);

  useEffect(() => {
    const checkRoute = () => {
      const pathname = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      const adminKey = params.get('admin');

      if (pathname.startsWith('/deal/')) {
        const t = pathname.slice('/deal/'.length).replace(/\/$/, '');
        if (t) {
          setDealToken(t);
          setCurrentPage('public-deal' as any);
        }
      } else if (pathname === '/onboarding' || pathname === '/onboarding/') {
        setCurrentPage('client-onboarding' as any);
      } else if (pathname === '/client-login' || pathname === '/client-login/') {
        setCurrentPage('client-login');
      } else if (pathname === '/crm' || pathname === '/crm/' || pathname.startsWith('/crm/')) {
        setCurrentPage('crm-new');
      } else if (pathname === '/order-placement') {
        setCurrentPage('order-placement');
      } else if (pathname === '/privacy') {
        setCurrentPage('privacy');
      } else if (pathname === '/terms') {
        setCurrentPage('terms');
      } else if (pathname === '/risk') {
        setCurrentPage('risk');
      } else if (pathname === '/mutual-funds') {
        setCurrentPage('mutual-funds');
      } else if (pathname === '/primary-bonds') {
        setCurrentPage('primary-bonds');
      } else if (pathname === '/fixed-deposits') {
        setCurrentPage('fixed-deposits');
      } else if (pathname === '/insurance') {
        setCurrentPage('insurance');
      } else if (adminKey === 'niyom_admin_2024') {
        setIsAdmin(true);
        setCurrentPage('admin');
      }
    };

    checkRoute();
    window.addEventListener('popstate', checkRoute);

    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  // Resolve whether the logged-in user is a public client or CRM employee (runs once per user session)
  useEffect(() => {
    if (!user) { setIsPublicClient(null); return; }
    import('./lib/supabase').then(({ supabase }) => {
      supabase.from('nw_employees').select('id').eq('auth_user_id', user.id).maybeSingle()
        .then(({ data }) => setIsPublicClient(!data));
    });
  }, [user]);

  useEffect(() => {
    if (loading) return;

    const pathname = window.location.pathname;
    if (pathname.startsWith('/crm') || pathname.startsWith('/client-login')) return;

    if (!user || isAdmin) {
      if (!isAdmin) {
        setShowAuth(false);
        setShowSignup(false);
      }
      return;
    }

    // Wait until we know whether this is a public client or CRM employee
    if (isPublicClient === null) return;
  

    // Only redirect to dashboard on initial login (when on landing/showing auth)
    if (isPublicClient && (currentPage === 'landing' || showAuth)) {
      setCurrentPage('dashboard');
      setShowAuth(false);
      setShowSignup(false);
    }
    // Once logged in, don't force-redirect — let the user navigate freely
  }, [user, loading, isAdmin, isPublicClient]);

  const handleGetStarted = () => {
    setShowAuth(true);
    setShowSignup(false);
  };

  const handleViewServices = () => {
    setCurrentPage('services');
  };

  const handleViewLearning = () => {
    setCurrentPage('learning');
  };

  const handleViewNews = () => {
    setCurrentPage('news');
  };

  const handleViewMFResearch = () => {
    setCurrentPage('mfresearch');
  };

  const handleViewCalculator = () => {
    setCurrentPage('calculator');
  };

  const handleViewUnlisted = () => {
    setCurrentPage('unlisted');
  };

  const handleViewBonds = () => {
    setCurrentPage('bonds');
  };

  const handleBackToLanding = () => {
    setCurrentPage('landing');
  };

  const handleSwitchToSignup = () => {
    setShowSignup(true);
  };

  const handleSwitchToLogin = () => {
    setShowSignup(false);
  };

  const handleCloseAuth = () => {
    setShowAuth(false);
    setShowSignup(false);
  };

  const handleNavigate = (page: string) => {
    setCurrentPage(page as any);
  };

  const handleKYCSuccess = () => {
    setCurrentPage('dashboard');
  };

  // Public secure deal-confirmation page — fully unauthenticated, takes priority
  if ((currentPage as any) === 'public-deal' && dealToken) {
    return <PublicDealView token={dealToken} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (isAdmin) {
    if (currentPage === 'admin') {
      return <AdminKYC onClose={handleBackToLanding} />;
    }
  }

  // Public onboarding page
  if ((currentPage as any) === 'client-onboarding') {
    return (
      <PublicOnboarding
        onBack={() => {
          window.history.pushState({}, '', '/client-login');
          setCurrentPage('client-login');
        }}
      />
    );
  }

  // Client login portal
  if (currentPage === 'client-login') {
    if (clientPortalId) {
      if (!clientPasswordChanged) {
        return (
          <ClientChangePassword
            clientId={clientPortalId}
            onComplete={() => setClientPasswordChanged(true)}
          />
        );
      }
      return <ClientPortal clientId={clientPortalId} onLogout={() => { setClientPortalId(null); setClientPasswordChanged(false); }} />;
    }
    return (
      <ClientLogin
        onLogin={(id, pwChanged) => { setClientPortalId(id); setClientPasswordChanged(pwChanged); }}
        onInvestNow={() => {
          window.history.pushState({}, '', '/onboarding');
          setCurrentPage('client-onboarding' as any);
        }}
      />
    );
  }

  // New premium CRM (takes priority)
  if (currentPage === 'crm-new') {
    return <CRM />;
  }

  if (currentPage === 'client-portal') {
    if (clientPortalId) {
      if (!clientPasswordChanged) {
        return (
          <ClientChangePassword
            clientId={clientPortalId}
            onComplete={() => setClientPasswordChanged(true)}
          />
        );
      }
      return <ClientPortal clientId={clientPortalId} onLogout={() => { setClientPortalId(null); setClientPasswordChanged(false); }} />;
    }
    return (
      <ClientLogin
        onLogin={(id, pwChanged) => { setClientPortalId(id); setClientPasswordChanged(pwChanged); }}
        onInvestNow={() => {
          window.history.pushState({}, '', '/onboarding');
          setCurrentPage('client-onboarding' as any);
        }}
      />
    );
  }

  // CRM routes must be checked before the generic `user` check
  if (currentPage === 'crm-login') {
    return <CRMLogin />;
  }

  if (currentPage === 'crm-employee') {
    return <EmployeeDashboard />;
  }

  if (currentPage === 'crm-admin') {
    return <AdminDashboard />;
  }

  if (currentPage === 'crm-add-deal') {
    return <AddDeal />;
  }

  if (currentPage === 'order-placement') {
    if (!user) {
      window.location.href = '/';
      return null;
    }
    return <OrderPlacement onClose={handleBackToLanding} />;
  }

  if (user && isPublicClient) {
    if (currentPage === 'kyc') {
      return <KYCForm onSubmitSuccess={handleKYCSuccess} onClose={handleBackToLanding} />;
    }
    if (currentPage === 'dashboard' || currentPage === 'landing') {
      return <Dashboard onNavigate={handleNavigate} onClose={handleBackToLanding} />;
    }
    // Allow public clients to navigate to public pages (learning, news, etc.)
    // They fall through to the page-specific renders below
  }

  if (currentPage === 'services') {
    return <Services onBack={handleBackToLanding} onGetStarted={handleGetStarted} />;
  }

  if (currentPage === 'learning') {
    return <Learning onBack={handleBackToLanding} />;
  }

  if (currentPage === 'news') {
    return <News onBack={handleBackToLanding} />;
  }

  if (currentPage === 'mfresearch') {
    return <MFResearch onBack={handleBackToLanding} />;
  }

  if (currentPage === 'calculator') {
    return <Calculator onBack={handleBackToLanding} />;
  }

  if (currentPage === 'unlisted') {
    return <UnlistedShares onBack={handleBackToLanding} onNavigateToSignUp={handleSwitchToSignup} onNavigateToKYC={() => handleNavigate('kyc')} initialTab="shares" />;
  }

  if (currentPage === 'bonds') {
    return <UnlistedShares onBack={handleBackToLanding} onNavigateToSignUp={handleSwitchToSignup} onNavigateToKYC={() => handleNavigate('kyc')} initialTab="bonds" />;
  }

  if (currentPage === 'privacy') {
    return <PrivacyPolicy onClose={handleBackToLanding} />;
  }

  if (currentPage === 'terms') {
    return <TermsOfUse onClose={handleBackToLanding} />;
  }

  if (currentPage === 'risk') {
    return <RiskDisclaimer onClose={handleBackToLanding} />;
  }

  if (currentPage === 'mutual-funds') {
    return <MutualFundsLead onBack={handleBackToLanding} />;
  }

  if (currentPage === 'primary-bonds') {
    return <PrimaryBondsLead onBack={handleBackToLanding} />;
  }

  if (currentPage === 'fixed-deposits') {
    return <FixedDepositsLead onBack={handleBackToLanding} />;
  }

  if (currentPage === 'insurance') {
    return <InsuranceLead onBack={handleBackToLanding} />;
  }

  if (showAuth) {
    if (showSignup) {
      return <SignUp onSwitchToLogin={handleSwitchToLogin} onClose={handleCloseAuth} />;
    }
    return <Login onSwitchToSignup={handleSwitchToSignup} onClose={handleCloseAuth} />;
  }

  return <Landing onGetStarted={handleGetStarted} onViewServices={handleViewServices} onViewLearning={handleViewLearning} onViewNews={handleViewNews} onViewMFResearch={handleViewMFResearch} onViewCalculator={handleViewCalculator} onViewUnlisted={handleViewUnlisted} onViewBonds={handleViewBonds} onNavigate={handleNavigate} />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
