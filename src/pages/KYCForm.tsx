import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Upload, Check, AlertCircle, X } from 'lucide-react';
import { KYCSubmission, UserProfile } from '../types';
import { Logo } from '../components/Logo';

interface KYCFormProps {
  onSubmitSuccess: () => void;
  onClose: () => void;
}

export function KYCForm({ onSubmitSuccess, onClose }: KYCFormProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [kyc, setKyc] = useState<KYCSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    pan: '',
    aadhar: '',
    demat: '',
  });

  const [files, setFiles] = useState({
    pan_document: null as File | null,
    aadhar_document: null as File | null,
    demat_document: null as File | null,
    bank_cheque_leaf: null as File | null,
  });

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [profileRes, kycRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('kyc_submissions').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (kycRes.data) {
        setKyc(kycRes.data);
        setFormData({
          pan: kycRes.data.pan || '',
          aadhar: kycRes.data.aadhar || '',
          demat: kycRes.data.demat || '',
        });
      }
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setFiles(prev => ({
        ...prev,
        [field]: file,
      }));
      setError('');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!user) return;

    setSubmitting(true);

    try {
      const documentMetadata = {
        pan_document: files.pan_document ? { name: files.pan_document.name, size: files.pan_document.size } : null,
        aadhar_document: files.aadhar_document ? { name: files.aadhar_document.name, size: files.aadhar_document.size } : null,
        demat_document: files.demat_document ? { name: files.demat_document.name, size: files.demat_document.size } : null,
        bank_cheque_leaf: files.bank_cheque_leaf ? { name: files.bank_cheque_leaf.name, size: files.bank_cheque_leaf.size } : null,
      };

      if (kyc?.id) {
        const { error: updateError } = await supabase
          .from('kyc_submissions')
          .update({
            pan: formData.pan,
            aadhar: formData.aadhar,
            demat: formData.demat,
            pan_document: documentMetadata.pan_document || kyc.pan_document,
            aadhar_document: documentMetadata.aadhar_document || kyc.aadhar_document,
            demat_document: documentMetadata.demat_document || kyc.demat_document,
            bank_cheque_leaf: documentMetadata.bank_cheque_leaf || kyc.bank_cheque_leaf,
            status: 'pending',
            submitted_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('kyc_submissions')
          .insert({
            user_id: user.id,
            pan: formData.pan,
            aadhar: formData.aadhar,
            demat: formData.demat,
            pan_document: documentMetadata.pan_document,
            aadhar_document: documentMetadata.aadhar_document,
            demat_document: documentMetadata.demat_document,
            bank_cheque_leaf: documentMetadata.bank_cheque_leaf,
            status: 'pending',
            submitted_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      await supabase
        .from('user_profiles')
        .update({ kyc_status: 'submitted' })
        .eq('id', user.id);

      setSuccess('KYC information submitted successfully!');
      setTimeout(onSubmitSuccess, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-50 border-green-200 text-green-700';
      case 'rejected':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'submitted':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      default:
        return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-10 border-t-4 border-[#c9b896] relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"
            title="Close and return to landing page"
          >
            <X size={28} />
          </button>
          <div className="flex items-center gap-4 mb-8">
            <Logo size="lg" />
            <div>
              <h2 className="text-3xl font-bold text-black" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Know Your Customer (KYC)</h2>
              <p className="text-gray-600 font-medium">Complete your KYC profile to unlock full account access</p>
            </div>
          </div>

          {profile && (
            <div className={`border rounded-lg p-4 mb-6 flex items-center gap-3 ${getStatusColor(profile.kyc_status)}`}>
              {profile.kyc_status === 'approved' ? (
                <Check size={20} />
              ) : (
                <AlertCircle size={20} />
              )}
              <div>
                <p className="font-semibold">KYC Status: {profile.kyc_status.toUpperCase()}</p>
                {kyc?.notes && <p className="text-sm mt-1">{kyc.notes}</p>}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                PAN (Permanent Account Number)
              </label>
              <input
                type="text"
                name="pan"
                value={formData.pan}
                onChange={handleInputChange}
                placeholder="AAABP5055K"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9b896] focus:border-transparent transition-all"
                required
              />
              <p className="text-xs text-gray-500 mt-1 font-medium">Your 10-digit PAN</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                PAN Document
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#c9b896] transition cursor-pointer bg-gray-50 hover:bg-[#c9b896]/5">
                <input
                  type="file"
                  onChange={(e) => handleFileChange(e, 'pan_document')}
                  accept="image/*,.pdf"
                  className="hidden"
                  id="pan-upload"
                />
                <label htmlFor="pan-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-[#c9b896] mx-auto mb-2" />
                  <p className="text-sm text-gray-700 font-medium">
                    {files.pan_document ? files.pan_document.name : 'Upload PAN document'}
                  </p>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                Aadhar Number
              </label>
              <input
                type="text"
                name="aadhar"
                value={formData.aadhar}
                onChange={handleInputChange}
                placeholder="1234 5678 9012"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9b896] focus:border-transparent transition-all"
                required
              />
              <p className="text-xs text-gray-500 mt-1 font-medium">Your 12-digit Aadhar number</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                Aadhar Document
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#c9b896] transition cursor-pointer bg-gray-50 hover:bg-[#c9b896]/5">
                <input
                  type="file"
                  onChange={(e) => handleFileChange(e, 'aadhar_document')}
                  accept="image/*,.pdf"
                  className="hidden"
                  id="aadhar-upload"
                />
                <label htmlFor="aadhar-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-[#c9b896] mx-auto mb-2" />
                  <p className="text-sm text-gray-700 font-medium">
                    {files.aadhar_document ? files.aadhar_document.name : 'Upload Aadhar document'}
                  </p>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                Demat Account Details
              </label>
              <input
                type="text"
                name="demat"
                value={formData.demat}
                onChange={handleInputChange}
                placeholder="DP ID and Client ID"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9b896] focus:border-transparent transition-all"
                required
              />
              <p className="text-xs text-gray-500 mt-1 font-medium">Your depository participant details</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                Demat Document
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#c9b896] transition cursor-pointer bg-gray-50 hover:bg-[#c9b896]/5">
                <input
                  type="file"
                  onChange={(e) => handleFileChange(e, 'demat_document')}
                  accept="image/*,.pdf"
                  className="hidden"
                  id="demat-upload"
                />
                <label htmlFor="demat-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-[#c9b896] mx-auto mb-2" />
                  <p className="text-sm text-gray-700 font-medium">
                    {files.demat_document ? files.demat_document.name : 'Upload Demat document'}
                  </p>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                Bank Cheque Leaf Copy
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#c9b896] transition cursor-pointer bg-gray-50 hover:bg-[#c9b896]/5">
                <input
                  type="file"
                  onChange={(e) => handleFileChange(e, 'bank_cheque_leaf')}
                  accept="image/*,.pdf"
                  className="hidden"
                  id="cheque-upload"
                />
                <label htmlFor="cheque-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-[#c9b896] mx-auto mb-2" />
                  <p className="text-sm text-gray-700 font-medium">
                    {files.bank_cheque_leaf ? files.bank_cheque_leaf.name : 'Upload cheque leaf copy'}
                  </p>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#c9b896] hover:bg-[#b5a57d] text-black font-bold py-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {submitting ? 'Submitting...' : 'Submit KYC Information'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
