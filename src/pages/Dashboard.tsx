import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, FileText, User, Menu, X } from 'lucide-react';
import { UserProfile, KYCSubmission } from '../types';
import { Logo } from '../components/Logo';

interface DashboardProps {
  onNavigate: (page: string) => void;
  onClose: () => void;
}

export function Dashboard({ onNavigate, onClose }: DashboardProps) {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [kyc, setKyc] = useState<KYCSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [profileRes, kycRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('kyc_submissions').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (kycRes.data) setKyc(kycRes.data);
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      submitted: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };
    return `px-3 py-1 rounded-full text-sm font-medium ${colors[status] || colors.pending}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-black shadow-lg border-b border-[#c9b896]/20">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <button
            onClick={onClose}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Logo size="md" />
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Client Portal</h1>
              <p className="text-[#c9b896] text-xs tracking-wider">NIYOM WEALTH</p>
            </div>
          </button>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              title="Close and return to landing page"
            >
              <X size={28} />
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 bg-[#c9b896] hover:bg-[#b5a57d] text-black px-5 py-2.5 rounded-lg transition-all duration-300 font-semibold shadow-md"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden text-white hover:text-[#c9b896] transition-colors"
          >
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-black border-t border-[#c9b896]/20 shadow-lg z-50">
            <div className="flex flex-col p-4 space-y-3">
              <button
                onClick={() => {
                  onClose();
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 text-white hover:text-[#c9b896] px-4 py-3 text-left hover:bg-white/5 rounded transition-colors font-medium"
              >
                <X size={20} />
                Close & Return to Home
              </button>
              <button
                onClick={() => {
                  handleSignOut();
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 bg-[#c9b896] hover:bg-[#b5a57d] text-black px-4 py-3 rounded-lg transition-all duration-300 font-semibold"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md border-t-4 border-[#c9b896] p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center gap-4">
              <User className="w-12 h-12 text-[#c9b896]" />
              <div>
                <p className="text-sm text-gray-600 font-medium">Account Status</p>
                <p className="text-xl font-bold text-black" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Active</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border-t-4 border-[#c9b896] p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center gap-4">
              <FileText className="w-12 h-12 text-[#c9b896]" />
              <div>
                <p className="text-sm text-gray-600 font-medium">KYC Status</p>
                <p className={`text-lg font-bold ${getStatusBadge(profile?.kyc_status || 'pending')}`}>
                  {profile?.kyc_status?.toUpperCase() || 'PENDING'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border-t-4 border-[#c9b896] p-6 hover:shadow-lg transition-all duration-300">
            <p className="text-sm text-gray-600 font-medium mb-2">Email</p>
            <p className="text-lg font-semibold text-black truncate">{user?.email}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl shadow-md border-l-4 border-[#c9b896] p-8 hover:shadow-lg transition-all duration-300">
            <h2 className="text-2xl font-bold text-black mb-6" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Profile Information</h2>
            {profile ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Full Name</p>
                  <p className="text-lg font-semibold text-black">{profile.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Email</p>
                  <p className="text-lg font-semibold text-black">{profile.email}</p>
                </div>
                {profile.phone && (
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Phone</p>
                    <p className="text-lg font-semibold text-black">{profile.phone}</p>
                  </div>
                )}
                {profile.address && (
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Address</p>
                    <p className="text-lg font-semibold text-black">{profile.address}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-600">No profile information found</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-md border-l-4 border-[#c9b896] p-8 hover:shadow-lg transition-all duration-300">
            <h2 className="text-2xl font-bold text-black mb-6" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>KYC Verification</h2>
            {profile?.kyc_status === 'pending' && !kyc ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4 font-medium">Complete your KYC to access all services</p>
                <button
                  onClick={() => onNavigate('kyc')}
                  className="bg-[#c9b896] hover:bg-[#b5a57d] text-black font-bold py-3 px-8 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  Start KYC Process
                </button>
              </div>
            ) : kyc ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Submission Status</p>
                  <div className={`inline-block ${getStatusBadge(kyc.status)}`}>
                    {kyc.status.toUpperCase()}
                  </div>
                </div>
                {kyc.pan && (
                  <div>
                    <p className="text-sm text-gray-600 font-medium">PAN</p>
                    <p className="font-semibold text-black">{kyc.pan}</p>
                  </div>
                )}
                {kyc.aadhar && (
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Aadhar</p>
                    <p className="font-semibold text-black">••••{kyc.aadhar.slice(-4)}</p>
                  </div>
                )}
                {kyc.notes && (
                  <div className="bg-[#c9b896]/10 border-2 border-[#c9b896]/30 p-4 rounded-lg mt-4">
                    <p className="text-sm text-gray-600 font-medium mb-1">Admin Notes</p>
                    <p className="text-black">{kyc.notes}</p>
                  </div>
                )}
                {kyc.status === 'pending' && (
                  <button
                    onClick={() => onNavigate('kyc')}
                    className="w-full bg-[#c9b896] hover:bg-[#b5a57d] text-black font-bold py-3 rounded-lg transition-all duration-300 mt-4 shadow-md hover:shadow-lg"
                  >
                    Update KYC Information
                  </button>
                )}
              </div>
            ) : (
              <p className="text-gray-600">No KYC submission yet</p>
            )}
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h3 className="font-bold text-yellow-900 mb-3 text-lg">Important Notice</h3>
            <p className="text-sm text-yellow-900">
              <strong>We are not SEBI Registered Investment Advisers.</strong> We provide product distribution and information services. All investment decisions are yours to make. We do not provide personalized investment advice or recommendations. Please consult a qualified financial advisor for investment advice.
            </p>
          </div>

          <div className="bg-gradient-to-r from-[#c9b896]/10 to-[#c9b896]/5 rounded-xl p-8 border-l-4 border-[#c9b896]">
            <h3 className="font-bold text-black mb-4 text-xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Next Steps</h3>
            <ul className="text-gray-700 space-y-3 text-base">
              {profile?.kyc_status === 'pending' && (
                <li className="flex items-start gap-2"><span className="text-[#c9b896] font-bold">•</span> Complete your KYC verification to access products and services</li>
              )}
              {profile?.kyc_status === 'submitted' && (
                <li className="flex items-start gap-2"><span className="text-[#c9b896] font-bold">•</span> Your KYC is under review. We'll notify you once verified.</li>
              )}
              {profile?.kyc_status === 'approved' && (
                <li className="flex items-start gap-2"><span className="text-[#c9b896] font-bold">•</span> Your account is verified. You can now access investment products.</li>
              )}
              <li className="flex items-start gap-2"><span className="text-[#c9b896] font-bold">•</span> Schedule a consultation to discuss available products</li>
              <li className="flex items-start gap-2"><span className="text-[#c9b896] font-bold">•</span> Explore investment product options and educational resources</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
