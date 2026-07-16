import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Check, X, Clock, FileText } from 'lucide-react';
import { KYCSubmission, UserProfile } from '../types';
import { Logo } from '../components/Logo';

interface KYCWithProfile extends KYCSubmission {
  user_profiles?: UserProfile;
}

interface AdminKYCProps {
  onClose: () => void;
}

export function AdminKYC({ onClose }: AdminKYCProps) {
  const [submissions, setSubmissions] = useState<KYCWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    const { data, error } = await supabase
      .from('kyc_submissions')
      .select('*, user_profiles!inner(full_name, email, phone)')
      .order('submitted_at', { ascending: false });

    if (!error && data) {
      setSubmissions(data as any);
    }
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    setSubmitting(true);
    const { error } = await supabase
      .from('kyc_submissions')
      .update({ status: 'approved', notes })
      .eq('id', id);

    if (!error) {
      const userId = submissions.find(s => s.id === id)?.user_id;
      if (userId) {
        await supabase
          .from('user_profiles')
          .update({ kyc_status: 'approved' })
          .eq('id', userId);
      }
      fetchSubmissions();
      setSelectedId(null);
      setNotes('');
    }
    setSubmitting(false);
  };

  const handleReject = async (id: string) => {
    setSubmitting(true);
    const { error } = await supabase
      .from('kyc_submissions')
      .update({ status: 'rejected', notes })
      .eq('id', id);

    if (!error) {
      const userId = submissions.find(s => s.id === id)?.user_id;
      if (userId) {
        await supabase
          .from('user_profiles')
          .update({ kyc_status: 'rejected' })
          .eq('id', userId);
      }
      fetchSubmissions();
      setSelectedId(null);
      setNotes('');
    }
    setSubmitting(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'rejected':
        return <X className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-50 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-50 text-red-800 border-red-200';
      default:
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading submissions...</div>;
  }

  return (
    <div className="min-h-screen bg-bg-base py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Logo size="lg" />
            <h1 className="text-4xl font-bold text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>KYC Management</h1>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-secondary transition-colors"
            title="Close and return to landing page"
          >
            <X size={32} />
          </button>
        </div>

        <div className="bg-bg-elevated rounded-2xl shadow-xl overflow-hidden border-t-4 border-accent">
          <table className="w-full">
            <thead className="bg-black">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Client Name</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Email</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Status</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>PAN</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Submitted</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-text-secondary font-medium">
                    No KYC submissions yet
                  </td>
                </tr>
              ) : (
                submissions.map(submission => (
                  <tr key={submission.id} className="hover:bg-accent/5 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-text-primary">
                        {(submission as any).user_profiles?.full_name || 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary font-medium">
                      {(submission as any).user_profiles?.email}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(submission.status)}
                        <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 ${getStatusColor(submission.status)}`}>
                          {submission.status.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary font-semibold">
                      {submission.pan || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary font-medium">
                      {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      {submission.status === 'pending' ? (
                        <button
                          onClick={() => setSelectedId(submission.id)}
                          className="text-accent hover:text-accent-strong font-bold flex items-center gap-1 transition-colors"
                        >
                          <FileText size={16} />
                          Review
                        </button>
                      ) : (
                        <span className="text-text-muted text-sm">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedId && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-bg-elevated rounded-2xl max-w-md w-full p-8 border-t-4 border-accent shadow-2xl">
              <h3 className="text-2xl font-bold text-text-primary mb-6" style={{ fontFamily: 'var(--font-display)' }}>Review KYC Submission</h3>
              <div className="space-y-4 mb-6">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for approval/rejection..."
                  className="w-full border-2 border-border rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  rows={4}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedId(null);
                    setNotes('');
                  }}
                  className="flex-1 bg-bg-raised hover:bg-bg-surface text-text-primary border border-border font-bold py-3 rounded-lg transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReject(selectedId)}
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-md hover:shadow-lg"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(selectedId)}
                  disabled={submitting}
                  className="flex-1 bg-accent hover:bg-accent-strong text-on-accent font-bold py-3 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-md hover:shadow-lg"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
