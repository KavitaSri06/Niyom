import { ArrowLeft, Heart, User, Mail, Phone, DollarSign, Clock, Target, FileText, CheckCircle, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';

interface InsuranceLeadProps {
  onBack: () => void;
}

export function InsuranceLead({ onBack }: InsuranceLeadProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    investmentAmount: '',
    investmentHorizon: '',
    riskProfile: '',
    additionalNotes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error: leadError } = await supabase
        .from('investment_leads')
        .insert({
          product_type: 'insurance',
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          investment_amount: formData.investmentAmount,
          investment_horizon: formData.investmentHorizon,
          risk_profile: formData.riskProfile,
          additional_notes: formData.additionalNotes
        });

      if (leadError) throw leadError;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`;
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_type: 'Insurance',
          ...formData
        })
      });

      setIsSubmitted(true);
    } catch (error) {
      console.error('Error submitting lead:', error);
      alert('Failed to submit. Please try again or contact us directly.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-100 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-12 text-center">
          <div className="mb-6">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
          </div>
          <h2 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            Thank You!
          </h2>
          <p className="text-xl text-gray-600 mb-6">
            We've received your interest in Insurance Products
          </p>
          <p className="text-gray-600 mb-8">
            Our insurance specialist will contact you within 24 hours to discuss the best coverage options for your needs.
          </p>
          <button
            onClick={onBack}
            className="bg-[#c9b896] hover:bg-[#b5a57d] text-black px-8 py-3 rounded-lg font-semibold transition-all duration-300 shadow-md hover:shadow-lg"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-100">
      <nav className="bg-black text-white py-5 px-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <button
            onClick={onBack}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Logo size="md" />
            <div className="text-left">
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Cormorant Garamond, serif', letterSpacing: '0.1em' }}>NIYOM WEALTH</h1>
              <p className="text-[#c9b896] text-xs tracking-widest">INSURANCE</p>
            </div>
          </button>

          <button
            onClick={onBack}
            className="hidden md:flex bg-[#c9b896] hover:bg-[#b5a57d] text-black px-8 py-3 rounded-md font-semibold transition-all duration-300 shadow-md hover:shadow-lg items-center gap-2"
          >
            <ArrowLeft size={20} /> Back to Home
          </button>

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
                  onBack();
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 bg-[#c9b896] hover:bg-[#b5a57d] text-black px-4 py-3 rounded-md font-semibold transition-all duration-300"
              >
                <ArrowLeft size={20} /> Back to Home
              </button>
            </div>
          </div>
        )}
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-gradient-to-r from-red-500 to-red-700 text-white p-8 rounded-2xl shadow-xl mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 p-4 rounded-full">
              <Heart className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
                Protect What Matters Most
              </h2>
              <p className="text-red-100 text-lg">
                Comprehensive insurance solutions for you and your family
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <p className="text-sm text-red-100 mb-1">Life Protection</p>
              <p className="font-bold text-lg">Family Security</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <p className="text-sm text-red-100 mb-1">Health Cover</p>
              <p className="font-bold text-lg">Medical Safety</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <p className="text-sm text-red-100 mb-1">Wealth Protection</p>
              <p className="font-bold text-lg">Asset Safety</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            Share Your Details
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                  <User size={20} className="text-[#c9b896]" />
                  Full Name *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                  <Mail size={20} className="text-[#c9b896]" />
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                  <Phone size={20} className="text-[#c9b896]" />
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  pattern="[0-9]{10}"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="10-digit mobile number"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                  <Target size={20} className="text-[#c9b896]" />
                  Insurance Type *
                </label>
                <select
                  name="riskProfile"
                  value={formData.riskProfile}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="">Select insurance type</option>
                  <option value="Life Insurance">Life Insurance (Term/Endowment/ULIP)</option>
                  <option value="Health Insurance">Health Insurance (Individual/Family Floater)</option>
                  <option value="Critical Illness">Critical Illness Insurance</option>
                  <option value="General Insurance">General Insurance (Car/Home/Travel)</option>
                  <option value="Multiple">Multiple Products</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                  <DollarSign size={20} className="text-[#c9b896]" />
                  Coverage Amount *
                </label>
                <select
                  name="investmentAmount"
                  value={formData.investmentAmount}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="">Select coverage range</option>
                  <option value="₹10-25 Lakhs">₹10-25 Lakhs</option>
                  <option value="₹25-50 Lakhs">₹25-50 Lakhs</option>
                  <option value="₹50 Lakhs - ₹1 Crore">₹50 Lakhs - ₹1 Crore</option>
                  <option value="₹1-2 Crores">₹1-2 Crores</option>
                  <option value="Above ₹2 Crores">Above ₹2 Crores</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                  <Clock size={20} className="text-[#c9b896]" />
                  Policy Term *
                </label>
                <select
                  name="investmentHorizon"
                  value={formData.investmentHorizon}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="">Select policy duration</option>
                  <option value="1 year">1 year (Health/General)</option>
                  <option value="5-10 years">5-10 years</option>
                  <option value="10-20 years">10-20 years</option>
                  <option value="20-30 years">20-30 years</option>
                  <option value="Till retirement">Till retirement</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                <FileText size={20} className="text-[#c9b896]" />
                Additional Notes (Optional)
              </label>
              <textarea
                name="additionalNotes"
                value={formData.additionalNotes}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Current coverage, family details, specific requirements, or questions..."
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-900">
                <strong>Disclaimer:</strong> We are insurance product distributors. We work with leading insurance companies to provide suitable options. All policy terms and conditions are subject to insurer approval. This is not insurance advice - please review policy documents carefully before purchasing.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Submitting...' : 'Submit Interest'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
