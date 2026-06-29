import React, { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface UnlistedShare {
  id: string;
  symbol: string;
  company_name: string;
  current_price: number;
  price_change_percent: number;
  lot_size: number;
  sector: string;
  description: string;
}

interface OrderPlacementProps {
  onClose: () => void;
}

export default function OrderPlacement({ onClose }: OrderPlacementProps) {
  const { user } = useAuth();
  const [share, setShare] = useState<UnlistedShare | null>(null);
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [lots, setLots] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');

  const MAX_INVESTMENT = 500000;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('shareId');
    const type = params.get('type') as 'buy' | 'sell';

    if (shareId && type) {
      setOrderType(type);
      fetchShareDetails(shareId);
    } else {
      window.location.href = '/unlisted-shares';
    }
  }, []);

  const fetchShareDetails = async (shareId: string) => {
    try {
      const { data, error } = await supabase
        .from('unlisted_shares')
        .select('*')
        .eq('id', shareId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setShare(data);
      }
    } catch (err) {
      console.error('Error fetching share details:', err);
      setError('Failed to load share details');
    } finally {
      setLoading(false);
    }
  };

  const totalShares = share ? lots * share.lot_size : 0;
  const totalInvestment = share ? lots * share.lot_size * share.current_price : 0;
  const exceedsLimit = totalInvestment > MAX_INVESTMENT;

  const handleLotsChange = (value: number) => {
    if (value < 1) return;
    setLots(value);
    setError('');
  };

  const handleSubmitOrder = async () => {
    if (!share || !user) return;

    if (exceedsLimit) {
      setError('No more shares available. Investment limit of ₹5,00,000 exceeded.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error: insertError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          share_id: share.id,
          symbol: share.symbol,
          company_name: share.company_name,
          order_type: orderType,
          lots: lots,
          shares_quantity: totalShares,
          price_per_share: share.current_price,
          total_amount: totalInvestment,
          status: 'pending'
        });

      if (insertError) throw insertError;

      setShowConfirmation(true);
    } catch (err) {
      console.error('Error submitting order:', err);
      setError('Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!share) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-xl mb-4">Share not found</p>
          <button
            onClick={() => window.location.href = '/unlisted-shares'}
            className="text-emerald-400 hover:text-emerald-300"
          >
            Go back to unlisted shares
          </button>
        </div>
      </div>
    );
  }

  if (showConfirmation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-bg-elevated rounded-2xl shadow-2xl p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">Order Submitted Successfully!</h2>
            <p className="text-text-secondary mb-6">
              Your order is under process. You will soon receive a call or message from our team.
              Thank you for doing business with us!
            </p>
            <div className="bg-bg-base rounded-lg p-4 mb-6 text-left">
              <div className="flex justify-between mb-2">
                <span className="text-text-secondary">Company:</span>
                <span className="font-semibold text-text-primary">{share.company_name}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-text-secondary">Order Type:</span>
                <span className="font-semibold text-text-primary uppercase">{orderType}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-text-secondary">Lots:</span>
                <span className="font-semibold text-text-primary">{lots}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Total Amount:</span>
                <span className="font-semibold text-text-primary">₹{totalInvestment.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => window.location.href = '/unlisted-shares'}
            className="flex items-center text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back to Unlisted Shares
          </button>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-white transition-colors"
            title="Close and return to landing page"
          >
            <X size={28} />
          </button>
        </div>

        <div className="bg-bg-elevated rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
            <h1 className="text-3xl font-bold mb-2">{share.company_name}</h1>
            <p className="text-emerald-100 mb-4">{share.sector}</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm">Current Price</p>
                <p className="text-4xl font-bold">₹{share.current_price.toLocaleString('en-IN')}</p>
              </div>
              <div className={`flex items-center ${share.price_change_percent >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                {share.price_change_percent >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                <span className="text-2xl font-semibold ml-2">
                  {share.price_change_percent >= 0 ? '+' : ''}{share.price_change_percent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setOrderType('buy')}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    orderType === 'buy'
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : 'bg-bg-raised text-text-secondary hover:bg-bg-raised'
                  }`}
                >
                  BUY
                </button>
                <button
                  onClick={() => setOrderType('sell')}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    orderType === 'sell'
                      ? 'bg-red-600 text-white shadow-lg'
                      : 'bg-bg-raised text-text-secondary hover:bg-bg-raised'
                  }`}
                >
                  SELL
                </button>
              </div>

              <div className="bg-bg-base rounded-lg p-4 mb-6">
                <div className="flex justify-between mb-3">
                  <span className="text-text-secondary">Lot Size:</span>
                  <span className="font-semibold text-text-primary">{share.lot_size} shares</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Price per Share:</span>
                  <span className="font-semibold text-text-primary">₹{share.current_price.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-text-secondary font-semibold mb-2">
                  Number of Lots
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleLotsChange(lots - 1)}
                    className="w-12 h-12 rounded-lg bg-bg-raised hover:bg-gray-300 text-text-secondary font-bold text-xl transition-colors"
                    disabled={lots <= 1}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={lots}
                    onChange={(e) => handleLotsChange(parseInt(e.target.value) || 1)}
                    className="flex-1 px-4 py-3 border-2 border-border-strong rounded-lg text-center text-xl font-semibold focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleLotsChange(lots + 1)}
                    className="w-12 h-12 rounded-lg bg-bg-raised hover:bg-gray-300 text-text-secondary font-bold text-xl transition-colors"
                    disabled={exceedsLimit}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg p-4 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-text-secondary">Total Shares:</span>
                  <span className="font-semibold text-text-primary">{totalShares.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-text-secondary">Total Investment:</span>
                  <span className="font-bold text-xl text-text-primary">₹{totalInvestment.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Remaining Limit:</span>
                  <span className={`font-semibold ${exceedsLimit ? 'text-red-600' : 'text-emerald-600'}`}>
                    ₹{Math.max(0, MAX_INVESTMENT - totalInvestment).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {exceedsLimit && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start">
                  <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-red-800 text-sm">
                    No more shares available. Your investment exceeds the maximum limit of ₹5,00,000.
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start">
                  <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmitOrder}
                disabled={submitting || exceedsLimit}
                className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
                  orderType === 'buy'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } ${(submitting || exceedsLimit) ? 'opacity-50 cursor-not-allowed' : 'shadow-lg hover:shadow-xl'}`}
              >
                {submitting ? 'Submitting...' : `Confirm ${orderType.toUpperCase()} Order`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
