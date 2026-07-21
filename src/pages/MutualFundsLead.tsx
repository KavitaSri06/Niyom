import { ArrowLeft, TrendingUp, User, Mail, Phone, DollarSign, Clock, Target, FileText, CheckCircle, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';
import { HeroBackground } from '../components/HeroBackground';

interface MutualFundsLeadProps {
  onBack: () => void;
}

export function MutualFundsLead({ onBack }: MutualFundsLeadProps) {
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
          product_type: 'mutual-funds',
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          investment_amount: formData.investmentAmount,
          investment_horizon: formData.investmentHorizon,
          risk_profile: formData.riskProfile,
          additional_notes: formData.additionalNotes
        });

      if (leadError) throw leadError;

      // Trigger notification
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`;
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_type: 'Mutual Funds',
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
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-bg-elevated rounded-2xl shadow-2xl p-12 text-center">
          <div className="mb-6">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
          </div>
          <h2 className="text-4xl font-bold text-text-primary mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Thank You!
          </h2>
          <p className="text-xl text-text-secondary mb-6">
            We've received your interest in Mutual Funds
          </p>
          <p className="text-text-secondary mb-8">
            Our team will contact you within 24 hours to discuss investment opportunities and answer your questions.
          </p>
          <button
            onClick={onBack}
            className="bg-accent-soft hover:bg-accent-soft-deep text-black px-8 py-3 rounded-lg font-semibold transition-all duration-300 shadow-md hover:shadow-lg"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <nav className="bg-black text-white py-5 px-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <button
            onClick={onBack}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Logo size="md" />
            <div className="text-left">
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-body)', letterSpacing: '0.1em' }}>NIYOM WEALTH</h1>
              <p className="text-accent-soft text-xs tracking-widest">MUTUAL FUNDS</p>
            </div>
          </button>

          <button
            onClick={onBack}
            className="hidden md:flex bg-accent-soft hover:bg-accent-soft-deep text-black px-8 py-3 rounded-md font-semibold transition-all duration-300 shadow-md hover:shadow-lg items-center gap-2"
          >
            <ArrowLeft size={20} /> Back to Home
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden text-white hover:text-accent-soft transition-colors"
          >
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-black border-t border-accent-soft/20 shadow-lg z-50">
            <div className="flex flex-col p-4 space-y-3">
              <button
                onClick={() => {
                  onBack();
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 bg-accent-soft hover:bg-accent-soft-deep text-black px-4 py-3 rounded-md font-semibold transition-all duration-300"
              >
                <ArrowLeft size={20} /> Back to Home
              </button>
            </div>
          </div>
        )}
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div data-theme="dark" className="relative overflow-hidden text-white p-8 rounded-2xl shadow-xl mb-8 border border-white/10">
          <HeroBackground />
          <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/10 border border-white/15 p-4 rounded-full">
              <TrendingUp className="w-10 h-10 text-accent-soft" />
            </div>
            <div>
              <h2 className="text-4xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Invest in Mutual Funds
              </h2>
              <p className="text-gray-300 text-lg">
                Start your wealth creation journey with professionally managed mutual funds
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white/5 border border-white/10 backdrop-blur-sm p-4 rounded-lg">
              <p className="text-sm text-gray-300 mb-1">Diversification</p>
              <p className="font-bold text-lg">Spread Risk</p>
            </div>
            <div className="bg-white/5 border border-white/10 backdrop-blur-sm p-4 rounded-lg">
              <p className="text-sm text-gray-300 mb-1">Professional</p>
              <p className="font-bold text-lg">Expert Management</p>
            </div>
            <div className="bg-white/5 border border-white/10 backdrop-blur-sm p-4 rounded-lg">
              <p className="text-sm text-gray-300 mb-1">Flexibility</p>
              <p className="font-bold text-lg">Start Small</p>
            </div>
          </div>
          </div>
        </div>

        <div className="bg-bg-elevated rounded-2xl shadow-xl p-8">
          <h3 className="text-2xl font-bold text-text-primary mb-6" style={{ fontFamily: 'var(--font-display)' }}>
            Share Your Details
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-text-secondary font-semibold mb-2">
                  <User size={20} className="text-accent" />
                  Full Name *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-text-secondary font-semibold mb-2">
                  <Mail size={20} className="text-accent" />
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-text-secondary font-semibold mb-2">
                  <Phone size={20} className="text-accent" />
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  pattern="[0-9]{10}"
                  className="w-full px-4 py-3 border border-border-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="10-digit mobile number"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-text-secondary font-semibold mb-2">
                  <DollarSign size={20} className="text-accent" />
                  Investment Amount *
                </label>
                <select
                  name="investmentAmount"
                  value={formData.investmentAmount}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select range</option>
                  <option value="Under ₹1 Lakh">Under ₹1 Lakh</option>
                  <option value="₹1-5 Lakhs">₹1-5 Lakhs</option>
                  <option value="₹5-10 Lakhs">₹5-10 Lakhs</option>
                  <option value="₹10-25 Lakhs">₹10-25 Lakhs</option>
                  <option value="₹25-50 Lakhs">₹25-50 Lakhs</option>
                  <option value="Above ₹50 Lakhs">Above ₹50 Lakhs</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-text-secondary font-semibold mb-2">
                  <Clock size={20} className="text-accent" />
                  Investment Horizon *
                </label>
                <select
                  name="investmentHorizon"
                  value={formData.investmentHorizon}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select timeframe</option>
                  <option value="Less than 1 year">Less than 1 year</option>
                  <option value="1-3 years">1-3 years</option>
                  <option value="3-5 years">3-5 years</option>
                  <option value="5-10 years">5-10 years</option>
                  <option value="More than 10 years">More than 10 years</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-text-secondary font-semibold mb-2">
                  <Target size={20} className="text-accent" />
                  Risk Profile *
                </label>
                <select
                  name="riskProfile"
                  value={formData.riskProfile}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select risk tolerance</option>
                  <option value="Conservative">Conservative - Low Risk</option>
                  <option value="Moderate">Moderate - Balanced</option>
                  <option value="Aggressive">Aggressive - High Growth</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-text-secondary font-semibold mb-2">
                <FileText size={20} className="text-accent" />
                Additional Notes (Optional)
              </label>
              <textarea
                name="additionalNotes"
                value={formData.additionalNotes}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-3 border border-border-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Any specific mutual fund categories or questions you have..."
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-900">
                <strong>Disclaimer:</strong> We are not SEBI Registered Investment Advisers. We distribute mutual fund products only. All investment decisions are yours to make. Mutual fund investments are subject to market risks. Read all scheme-related documents carefully before investing.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent hover:bg-accent-strong text-on-accent font-bold py-4 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Submitting...' : 'Submit Interest'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
