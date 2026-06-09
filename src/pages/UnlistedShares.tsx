import { ArrowLeft, TrendingUp, TrendingDown, Search, X, Menu, ChevronRight, Info, Calendar, IndianRupee, Building2, Briefcase, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';

interface UnlistedSharesProps {
  onBack: () => void;
  onNavigateToSignUp: () => void;
  onNavigateToKYC: () => void;
  initialTab?: 'shares' | 'bonds';
}

interface Share {
  id: string;
  symbol: string;
  company_name: string;
  current_price: number;
  previous_price: number;
  price_change_percent: number;
  lot_size: number;
  sector: string;
  description: string;
  last_updated: string;
  logo_url?: string;
  ipo_status?: string;
}

interface Bond {
  id: string;
  bond_name: string;
  issuer: string;
  isin: string;
  current_yield: number;
  coupon_rate: number;
  maturity_date: string;
  face_value: number;
  current_price: number;
  previous_price: number;
  price_change_percent: number;
  rating: string;
  description: string;
  last_updated: string;
  logo_url?: string;
}

export function UnlistedShares({ onBack, onNavigateToSignUp, onNavigateToKYC, initialTab = 'shares' }: UnlistedSharesProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'shares' | 'bonds'>(initialTab);
  const [shares, setShares] = useState<Share[]>([]);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Share | Bond | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sharesData } = await supabase
        .from('unlisted_shares')
        .select('*')
        .neq('ipo_status', 'listed')
        .order('company_name', { ascending: true })
        .limit(50);

      const { data: bondsData } = await supabase
        .from('secondary_bonds')
        .select('*')
        .order('current_yield', { ascending: false })
        .limit(20);

      if (sharesData) setShares(sharesData);
      if (bondsData) setBonds(bondsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyClick = (type: 'buy' | 'sell') => {
    if (!user) {
      onNavigateToSignUp();
      return;
    }
    if (selectedItem && isShare(selectedItem)) {
      window.location.href = `/order-placement?shareId=${selectedItem.id}&type=${type}`;
    }
  };


  const filteredShares = shares.filter(share =>
    share.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    share.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    share.sector.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBonds = bonds.filter(bond =>
    bond.bond_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bond.issuer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bond.isin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isShare = (item: Share | Bond): item is Share => {
    return 'symbol' in item;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-100">
      <nav className="bg-black text-white py-5 px-6 shadow-lg sticky top-0 z-50 relative">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <button
            onClick={onBack}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Logo size="md" />
            <div className="text-left">
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Cormorant Garamond, serif', letterSpacing: '0.1em' }}>NIYOM WEALTH</h1>
              <p className="text-[#c9b896] text-xs tracking-widest">UNLISTED INVESTMENTS</p>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-gradient-to-r from-black to-gray-900 text-white p-6 rounded-xl shadow-lg mb-8">
          <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            Alternative Investment Products
          </h2>
          <p className="text-gray-300">
            View and access unlisted shares and secondary market bonds. All investments carry high risk.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'shares' ? 'companies, symbols, sectors' : 'bonds, issuers, ISIN'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c9b896] focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('shares')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                activeTab === 'shares'
                  ? 'bg-[#c9b896] text-black shadow-lg'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Unlisted Shares
            </button>
            <button
              onClick={() => setActiveTab('bonds')}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                activeTab === 'bonds'
                  ? 'bg-[#c9b896] text-black shadow-lg'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Secondary Bonds
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#c9b896]"></div>
          </div>
        ) : activeTab === 'shares' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredShares.map((share) => (
              <div
                key={share.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border border-gray-200 cursor-pointer"
                onClick={() => setSelectedItem(share)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-shrink-0">
                      {share.logo_url ? (
                        <>
                          <img
                            src={share.logo_url}
                            alt={`${share.company_name} logo`}
                            className="w-10 h-10 rounded-lg object-contain border border-gray-200 bg-white"
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                          <div className="hidden w-10 h-10 bg-gradient-to-br from-[#c9b896] to-[#b5a57d] rounded-lg flex items-center justify-center">
                            <Building2 size={20} className="text-black" />
                          </div>
                        </>
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-[#c9b896] to-[#b5a57d] rounded-lg flex items-center justify-center">
                          <Building2 size={20} className="text-black" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {share.symbol}
                        </span>
                        <span className="text-xs text-gray-500">{share.sector}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 truncate">{share.company_name}</h3>
                    </div>
                  </div>
                  <ChevronRight className="text-gray-400 flex-shrink-0 ml-2" size={20} />
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">₹{share.current_price.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Lot Size: {share.lot_size}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${
                    share.price_change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {share.price_change_percent >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    <span className="font-semibold">{Math.abs(share.price_change_percent).toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredBonds.map((bond) => (
              <div
                key={bond.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border border-gray-200 cursor-pointer"
                onClick={() => setSelectedItem(bond)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-shrink-0">
                      {bond.logo_url ? (
                        <>
                          <img
                            src={bond.logo_url}
                            alt={`${bond.issuer} logo`}
                            className="w-10 h-10 rounded-lg object-contain border border-gray-200 bg-white"
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                          <div className="hidden w-10 h-10 bg-gradient-to-br from-gray-800 to-black rounded-lg flex items-center justify-center">
                            <Briefcase size={20} className="text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-black rounded-lg flex items-center justify-center">
                          <Briefcase size={20} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-white bg-black px-2 py-1 rounded">
                          {bond.rating}
                        </span>
                        <span className="text-xs text-gray-500 truncate">{bond.isin}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 truncate">{bond.bond_name}</h3>
                      <p className="text-sm text-gray-600 truncate">{bond.issuer}</p>
                    </div>
                  </div>
                  <ChevronRight className="text-gray-400 flex-shrink-0 ml-2" size={20} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Current Yield</p>
                    <p className="text-xl font-bold text-gray-900">{bond.current_yield.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Price</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold text-gray-900">₹{bond.current_price.toFixed(2)}</p>
                      <span className={`text-sm ${
                        bond.price_change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {bond.price_change_percent >= 0 ? '+' : ''}{bond.price_change_percent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 space-y-6">
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6">
            <h3 className="text-xl font-bold text-yellow-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              Important Disclaimer
            </h3>
            <div className="space-y-2 text-sm text-yellow-900">
              <p className="font-semibold">We are not SEBI Registered Investment Advisers.</p>
              <p>Unlisted shares and bonds carry significantly higher risks than listed securities including:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>High liquidity risk - You may not be able to sell when you want</li>
                <li>Limited information and disclosure</li>
                <li>No regulatory oversight</li>
                <li>Valuation challenges</li>
                <li>Risk of total capital loss</li>
              </ul>
              <p className="mt-3 font-semibold">
                Information provided is for reference only and does not constitute investment advice or recommendation. Please conduct your own due diligence and consult a qualified financial advisor before investing. Invest only what you can afford to lose.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#c9b896] to-[#b5a57d] rounded-xl p-8 text-center shadow-lg">
            <h3 className="text-2xl font-bold text-black mb-3">Ready to Proceed?</h3>
            <p className="text-gray-900 mb-6">Complete KYC to access product information and place orders</p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={onNavigateToSignUp}
                className="bg-black text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-900 transition-all duration-300 shadow-md"
              >
                Sign Up Now
              </button>
              <button
                onClick={onNavigateToKYC}
                className="bg-white text-black px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300 shadow-md"
              >
                Complete KYC
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-black to-gray-900 text-white p-6 rounded-t-xl">
              <div className="flex justify-between items-start gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="flex-shrink-0">
                    {selectedItem.logo_url ? (
                      <>
                        <img
                          src={selectedItem.logo_url}
                          alt={`${isShare(selectedItem) ? selectedItem.company_name : selectedItem.issuer} logo`}
                          className="w-16 h-16 rounded-lg object-contain border-2 border-[#c9b896] bg-white"
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fallback) fallback.classList.remove('hidden');
                          }}
                        />
                        <div className="hidden w-16 h-16 bg-gradient-to-br from-[#c9b896] to-[#b5a57d] rounded-lg flex items-center justify-center border-2 border-[#c9b896]">
                          {isShare(selectedItem) ? (
                            <Building2 size={28} className="text-black" />
                          ) : (
                            <Briefcase size={28} className="text-black" />
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-[#c9b896] to-[#b5a57d] rounded-lg flex items-center justify-center border-2 border-[#c9b896]">
                        {isShare(selectedItem) ? (
                          <Building2 size={28} className="text-black" />
                        ) : (
                          <Briefcase size={28} className="text-black" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold mb-2">
                      {isShare(selectedItem) ? selectedItem.company_name : selectedItem.bond_name}
                    </h2>
                    {isShare(selectedItem) ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-[#c9b896] text-black px-3 py-1 rounded-full text-sm font-semibold">
                          {selectedItem.symbol}
                        </span>
                        <span className="text-sm text-gray-300">{selectedItem.sector}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-[#c9b896] text-black px-3 py-1 rounded-full text-sm font-semibold">
                          {selectedItem.rating}
                        </span>
                        <span className="text-sm text-gray-300">{selectedItem.issuer}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-white hover:text-[#c9b896] transition-colors flex-shrink-0"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {isShare(selectedItem) ? (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <IndianRupee size={20} className="text-[#c9b896]" />
                        <p className="text-sm text-gray-600">Current Price</p>
                      </div>
                      <p className="text-2xl font-bold">₹{selectedItem.current_price.toFixed(2)}</p>
                      <p className={`text-sm ${
                        selectedItem.price_change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {selectedItem.price_change_percent >= 0 ? '+' : ''}{selectedItem.price_change_percent.toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Info size={20} className="text-[#c9b896]" />
                        <p className="text-sm text-gray-600">Lot Size</p>
                      </div>
                      <p className="text-2xl font-bold">{selectedItem.lot_size}</p>
                      <p className="text-sm text-gray-600">Min. Investment: ₹{(selectedItem.current_price * selectedItem.lot_size).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <Info size={20} className="text-[#c9b896]" />
                      About the Company
                    </h3>
                    <p className="text-gray-700">{selectedItem.description}</p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-900">
                      <strong>Latest Update:</strong> Prices are updated every 6 hours based on grey market trends. Last updated: {formatDate(selectedItem.last_updated)}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp size={20} className="text-[#c9b896]" />
                        <p className="text-sm text-gray-600">Current Yield</p>
                      </div>
                      <p className="text-2xl font-bold">{selectedItem.current_yield.toFixed(2)}%</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <IndianRupee size={20} className="text-[#c9b896]" />
                        <p className="text-sm text-gray-600">Current Price</p>
                      </div>
                      <p className="text-2xl font-bold">₹{selectedItem.current_price.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Coupon Rate</p>
                      <p className="text-xl font-bold">{selectedItem.coupon_rate.toFixed(2)}%</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Face Value</p>
                      <p className="text-xl font-bold">₹{selectedItem.face_value}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={20} className="text-[#c9b896]" />
                      <h3 className="text-lg font-bold">Maturity Date</h3>
                    </div>
                    <p className="text-gray-700">{formatDate(selectedItem.maturity_date)}</p>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <Info size={20} className="text-[#c9b896]" />
                      Bond Details
                    </h3>
                    <p className="text-gray-700 mb-2">{selectedItem.description}</p>
                    <p className="text-sm text-gray-600">ISIN: {selectedItem.isin}</p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-900">
                      <strong>Latest Update:</strong> Prices are updated every 6 hours. Last updated: {formatDate(selectedItem.last_updated)}
                    </p>
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleBuyClick('buy')}
                  className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-900 transition-all duration-300"
                >
                  Buy Now
                </button>
                <button
                  onClick={() => handleBuyClick('sell')}
                  className="flex-1 bg-[#c9b896] text-black py-3 rounded-lg font-semibold hover:bg-[#b5a57d] transition-all duration-300"
                >
                  Sell
                </button>
              </div>

              {!user && (
                <p className="text-center text-sm text-gray-500 mt-4">
                  Sign up to start trading
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}