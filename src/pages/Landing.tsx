import { ArrowRight, Shield, Target, Zap, TrendingUp, Users, Award, Instagram, Linkedin, ChevronRight, Phone, Mail, MessageCircle, Menu, X, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Logo } from '../components/Logo';
import { RegulatoryInfo } from '../components/RegulatoryInfo';
import { ThemeToggle } from '../theme/ThemeToggle';

interface LandingProps {
  onGetStarted: () => void;
  onViewServices: () => void;
  onViewLearning: () => void;
  onViewNews: () => void;
  onViewMFResearch: () => void;
  onViewCalculator: () => void;
  onViewUnlisted: () => void;
  onViewBonds: () => void;
  onNavigate: (page: string) => void;
}

export function Landing({ onGetStarted, onViewServices, onViewLearning, onViewNews, onViewMFResearch, onViewCalculator, onViewUnlisted, onViewBonds, onNavigate }: LandingProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isInvestDropdownOpen, setIsInvestDropdownOpen] = useState(false);
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Frosted-glass sticky nav — translucent navy over a blur so content
          scrolls softly beneath it. Falls back to solid navy where backdrop
          blur is unsupported. */}
      <nav
        className={`text-white sticky top-0 z-50 ${isLoaded ? 'animate-fadeIn' : 'opacity-0'}`}
        style={{
          background: 'rgba(7, 21, 36, 0.72)',
          backdropFilter: 'saturate(160%) blur(14px)',
          WebkitBackdropFilter: 'saturate(160%) blur(14px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center px-6 py-5">
            <button
              onClick={() => scrollToSection('home')}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <Logo size="md" className={isLoaded ? 'animate-scaleIn' : 'opacity-0'} />
              <div className="text-left">
                <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-body)', letterSpacing: '0.1em' }}>NIYOM WEALTH</h1>
                <p className="text-accent-soft text-xs tracking-widest">DISTRIBUTION LLP</p>
              </div>
            </button>

            <div className="hidden md:flex items-center gap-3">
              <ThemeToggle variant="icon" />
              <div className="relative">
                <button
                  onMouseEnter={() => setIsEmployeeDropdownOpen(true)}
                  onMouseLeave={() => setIsEmployeeDropdownOpen(false)}
                  className={`bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-md font-semibold transition-all duration-300 shadow-md hover:shadow-lg flex items-center gap-2 ${isLoaded ? 'animate-slideDown animate-delay-200' : 'opacity-0'}`}
                >
                  Employee Login
                  <ChevronDown size={16} className={`transition-transform duration-200 ${isEmployeeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isEmployeeDropdownOpen && (
                  <div
                    onMouseEnter={() => setIsEmployeeDropdownOpen(true)}
                    onMouseLeave={() => setIsEmployeeDropdownOpen(false)}
                    className="absolute top-full right-0 mt-0 bg-black border border-accent-soft/20 rounded-md shadow-lg min-w-[160px] z-50"
                  >
                    <button
                      onClick={() => window.open('https://www.zoho.com/people/login.html', '_blank')}
                      className="w-full text-left px-4 py-3 text-white hover:text-accent-soft hover:bg-bg-elevated/5 transition-colors duration-200 first:rounded-t-md"
                    >
                      HRM
                    </button>
                    <button
                      onClick={() => { window.location.href = '/crm'; }}
                      className="w-full text-left px-4 py-3 text-white hover:text-accent-soft hover:bg-bg-elevated/5 transition-colors duration-200 last:rounded-b-md"
                    >
                      CRM
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => onNavigate('client-login')}
                className={`bg-accent-soft hover:bg-accent-soft-deep text-black px-8 py-3 rounded-md font-semibold transition-all duration-300 shadow-md hover:shadow-lg ${isLoaded ? 'animate-slideDown animate-delay-200 animate-gold-shine' : 'opacity-0'}`}
              >
                Client Login
              </button>
            </div>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden text-white hover:text-accent-soft transition-colors"
            >
              {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>

          <div className="hidden md:flex items-center justify-center gap-8 px-6 pb-4 border-t border-accent-soft/20">
            <button
              onClick={() => scrollToSection('home')}
              className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 ${isLoaded ? 'animate-slideDown animate-delay-300' : 'opacity-0'}`}
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection('services')}
              className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 ${isLoaded ? 'animate-slideDown animate-delay-350' : 'opacity-0'}`}
            >
              Services
            </button>
            <button
              onClick={onViewLearning}
              className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 ${isLoaded ? 'animate-slideDown animate-delay-400' : 'opacity-0'}`}
            >
              Learning
            </button>
            <button
              onClick={onViewNews}
              className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 ${isLoaded ? 'animate-slideDown animate-delay-450' : 'opacity-0'}`}
            >
              News
            </button>
            <button
              onClick={onViewMFResearch}
              className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 ${isLoaded ? 'animate-slideDown animate-delay-500' : 'opacity-0'}`}
            >
              MF Research
            </button>
            <button
              onClick={onViewCalculator}
              className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 ${isLoaded ? 'animate-slideDown animate-delay-550' : 'opacity-0'}`}
            >
              Calculator
            </button>
            <div className="relative">
              <button
                onMouseEnter={() => setIsInvestDropdownOpen(true)}
                onMouseLeave={() => setIsInvestDropdownOpen(false)}
                className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 flex items-center gap-1 ${isLoaded ? 'animate-slideDown animate-delay-600' : 'opacity-0'}`}
              >
                Invest Now
                <ChevronDown size={16} className={`transition-transform duration-200 ${isInvestDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isInvestDropdownOpen && (
                <div
                  onMouseEnter={() => setIsInvestDropdownOpen(true)}
                  onMouseLeave={() => setIsInvestDropdownOpen(false)}
                  className="absolute top-full left-0 mt-0 bg-black border border-accent-soft/20 rounded-md shadow-lg min-w-[200px] z-50"
                >
                  <button
                    onClick={() => onNavigate('mutual-funds')}
                    className="w-full text-left px-4 py-3 text-white hover:text-accent-soft hover:bg-bg-elevated/5 transition-colors duration-200 first:rounded-t-md"
                  >
                    Mutual Funds
                  </button>
                  <button
                    onClick={() => onNavigate('primary-bonds')}
                    className="w-full text-left px-4 py-3 text-white hover:text-accent-soft hover:bg-bg-elevated/5 transition-colors duration-200"
                  >
                    Primary Bonds
                  </button>
                  <button
                    onClick={() => onNavigate('fixed-deposits')}
                    className="w-full text-left px-4 py-3 text-white hover:text-accent-soft hover:bg-bg-elevated/5 transition-colors duration-200"
                  >
                    Fixed Deposits
                  </button>
                  <button
                    onClick={() => onNavigate('insurance')}
                    className="w-full text-left px-4 py-3 text-white hover:text-accent-soft hover:bg-bg-elevated/5 transition-colors duration-200 last:rounded-b-md"
                  >
                    Insurance
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => scrollToSection('contact')}
              className={`text-white hover:text-accent-soft font-medium transition-colors duration-300 py-3 ${isLoaded ? 'animate-slideDown animate-delay-650' : 'opacity-0'}`}
            >
              Contact
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-black border-t border-accent-soft/20 shadow-lg">
            <div className="flex flex-col p-4 space-y-3">
              <button
                onClick={() => {
                  scrollToSection('home');
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:text-accent-soft font-medium py-3 px-4 text-left hover:bg-bg-elevated/5 rounded transition-colors"
              >
                Home
              </button>
              <button
                onClick={() => {
                  scrollToSection('services');
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:text-accent-soft font-medium py-3 px-4 text-left hover:bg-bg-elevated/5 rounded transition-colors"
              >
                Services
              </button>
              <button
                onClick={() => {
                  onViewLearning();
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:text-accent-soft font-medium py-3 px-4 text-left hover:bg-bg-elevated/5 rounded transition-colors"
              >
                Learning
              </button>
              <button
                onClick={() => {
                  onViewNews();
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:text-accent-soft font-medium py-3 px-4 text-left hover:bg-bg-elevated/5 rounded transition-colors"
              >
                News
              </button>
              <button
                onClick={() => {
                  onViewMFResearch();
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:text-accent-soft font-medium py-3 px-4 text-left hover:bg-bg-elevated/5 rounded transition-colors"
              >
                MF Research
              </button>
              <button
                onClick={() => {
                  onViewCalculator();
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:text-accent-soft font-medium py-3 px-4 text-left hover:bg-bg-elevated/5 rounded transition-colors"
              >
                Calculator
              </button>
              <div className="border-t border-accent-soft/20 my-2 pt-2">
                <div className="text-accent-soft text-xs uppercase tracking-wider px-4 py-2 font-semibold">Employee Login</div>
                <button
                  onClick={() => { window.open('https://www.zoho.com/people/login.html', '_blank'); setIsMobileMenuOpen(false); }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded mb-2 transition-colors"
                >
                  HRM
                </button>
                <button
                  onClick={() => { window.location.href = '/crm'; }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded mb-3 transition-colors"
                >
                  CRM
                </button>
                <button
                  onClick={() => {
                    onNavigate('client-login');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full bg-accent-soft hover:bg-accent-soft-deep text-black font-semibold py-3 px-4 rounded mb-3 transition-colors"
                >
                  Client Login
                </button>
              </div>
              <div className="border-t border-accent-soft/20 my-2 pt-2">
                <div className="text-accent-soft text-xs uppercase tracking-wider px-4 py-2 font-semibold">Invest Now</div>
                <button
                  onClick={() => {
                    onNavigate('mutual-funds');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-white hover:text-accent-soft font-medium py-3 px-6 text-left hover:bg-bg-elevated/5 rounded transition-colors"
                >
                  Mutual Funds
                </button>
                <button
                  onClick={() => {
                    onNavigate('primary-bonds');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-white hover:text-accent-soft font-medium py-3 px-6 text-left hover:bg-bg-elevated/5 rounded transition-colors"
                >
                  Primary Bonds
                </button>
                <button
                  onClick={() => {
                    onNavigate('fixed-deposits');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-white hover:text-accent-soft font-medium py-3 px-6 text-left hover:bg-bg-elevated/5 rounded transition-colors"
                >
                  Fixed Deposits
                </button>
                <button
                  onClick={() => {
                    onNavigate('insurance');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-white hover:text-accent-soft font-medium py-3 px-6 text-left hover:bg-bg-elevated/5 rounded transition-colors"
                >
                  Insurance
                </button>
              </div>
              <button
                onClick={() => {
                  scrollToSection('contact');
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:text-accent-soft font-medium py-3 px-4 text-left hover:bg-bg-elevated/5 rounded transition-colors"
              >
                Contact
              </button>
              <button
                onClick={() => {
                  onNavigate('client-login');
                  setIsMobileMenuOpen(false);
                }}
                className="bg-accent-soft hover:bg-accent-soft-deep text-black px-4 py-3 rounded-md font-semibold transition-all duration-300"
              >
                Client Login
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Inherently dark: sits on a dark photo, so it pins the dark token set
          regardless of the active theme — otherwise the light theme's
          dark-on-light gold would render muted brown on a black image. */}
      <section id="home" data-theme="dark" className="relative bg-black text-white py-32 px-6 overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <img
            src="https://images.pexels.com/photos/7567443/pexels-photo-7567443.jpeg?auto=compress&cs=tinysrgb&w=1920"
            alt="Wealth Management"
            className="w-full h-full object-cover"
          />
        </div>
        {/* Navy gradient scrim — deepens the brand tone and lifts headline
            contrast over the photo. A soft gold glow warms the centre. */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(7,21,36,0.55) 0%, rgba(7,21,36,0.35) 45%, rgba(7,21,36,0.88) 100%)' }} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(60% 55% at 50% 40%, rgba(200,164,93,0.10) 0%, transparent 70%)' }} />
        <div className="relative max-w-6xl mx-auto text-center">
          <h2 className={`text-6xl font-bold mb-6 leading-tight ${isLoaded ? 'animate-fadeInUp' : 'opacity-0'}`} style={{ fontFamily: 'var(--font-display)' }}>
            Your Financial Success<br />
            <span className="text-accent-soft">is Our Priority</span>
          </h2>
          <p className={`text-xl text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed ${isLoaded ? 'animate-fadeInUp animate-delay-200' : 'opacity-0'}`}>
            Comprehensive financial product distribution and information services to help you make informed investment decisions.
          </p>
          <button
            onClick={() => onNavigate('client-login')}
            className={`lift press bg-accent-soft hover:bg-accent-soft-deep text-black font-bold py-4 px-10 rounded-xl flex items-center gap-3 mx-auto shadow-lg text-lg ${isLoaded ? 'animate-fadeInUp animate-delay-400' : 'opacity-0'}`}
          >
            Get Started <ArrowRight size={24} />
          </button>
        </div>
      </section>

      <section id="services" className="py-20 px-6 bg-gradient-to-b from-bg-base to-bg-raised">
        <div className="max-w-7xl mx-auto">
          <h3 className={`text-4xl font-bold text-center text-text-primary mb-4 ${isLoaded ? 'animate-fadeInUp' : 'opacity-0'}`} style={{ fontFamily: 'var(--font-display)' }}>
            Our Services
          </h3>
          <div className={`w-24 h-1 bg-accent-soft mx-auto mb-16 ${isLoaded ? 'animate-scaleIn animate-delay-200' : 'opacity-0'}`}></div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: TrendingUp, title: 'Investment Products Distribution', desc: 'Access to mutual funds, stocks, and other investment products', img: 'https://images.pexels.com/photos/7567443/pexels-photo-7567443.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { icon: Target, title: 'Financial Information', desc: 'Educational resources and market information to help you decide', img: 'https://images.pexels.com/photos/6694543/pexels-photo-6694543.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { icon: Shield, title: 'Insurance Products', desc: 'Distribution of insurance solutions for asset protection', img: 'https://images.pexels.com/photos/7567434/pexels-photo-7567434.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { icon: Users, title: 'Documentation Assistance', desc: 'Support with paperwork for estate planning and transfers', img: 'https://images.pexels.com/photos/6963944/pexels-photo-6963944.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { icon: Award, title: 'Tax Information', desc: 'General information on tax-efficient investment structures', img: 'https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { icon: Zap, title: 'Alternative Products', desc: 'Distribution of secondary bonds, unlisted shares, and pre-IPO opportunities', img: 'https://images.pexels.com/photos/7567565/pexels-photo-7567565.jpeg?auto=compress&cs=tinysrgb&w=400' },
            ].map((service, i) => (
              <div key={i} className={`lift group bg-bg-elevated rounded-xl overflow-hidden border border-border-subtle ${isLoaded ? `animate-fadeInUp animate-delay-${(i + 3) * 100}` : 'opacity-0'}`} style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="h-48 overflow-hidden">
                  <img src={service.img} alt={service.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                </div>
                <div className="p-6">
                  <service.icon className="w-12 h-12 text-accent-soft mb-4" />
                  <h4 className="text-xl font-bold text-text-primary mb-3" style={{ fontFamily: 'var(--font-display)' }}>{service.title}</h4>
                  <p className="text-text-secondary leading-relaxed mb-4">{service.desc}</p>
                  <button
                    onClick={onViewServices}
                    className="w-full bg-text-primary text-bg-elevated hover:bg-accent hover:text-on-accent font-semibold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 group"
                  >
                    View Details <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Inherently dark (photo backdrop) — pin the dark token set. */}
      <section data-theme="dark" className="relative py-20 px-6 bg-black text-white">
        <div className="absolute inset-0 opacity-20">
          <img
            src="https://images.pexels.com/photos/6801647/pexels-photo-6801647.jpeg?auto=compress&cs=tinysrgb&w=1920"
            alt="Values"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative max-w-7xl mx-auto">
          <h3 className={`text-4xl font-bold text-center mb-4 ${isLoaded ? 'animate-fadeInUp' : 'opacity-0'}`} style={{ fontFamily: 'var(--font-display)' }}>
            Why Choose <span className="text-accent-soft">Niyom Wealth</span>?
          </h3>
          <div className={`w-24 h-1 bg-accent-soft mx-auto mb-16 ${isLoaded ? 'animate-scaleIn animate-delay-200' : 'opacity-0'}`}></div>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { title: 'Transparency', desc: 'Open and honest communication in all our interactions' },
              { title: 'Innovation', desc: 'Leveraging technology and new ideas to enhance services' },
              { title: 'Trust', desc: 'Building lasting relationships on mutual respect and integrity' },
              { title: 'Client-Centric', desc: 'Your financial goals are at the heart of everything we do' },
            ].map((value, i) => (
              <div key={i} className={`bg-white/5 backdrop-blur-sm p-8 rounded-xl border-l-4 border-accent-soft hover:bg-white/10 transition-all duration-300 ${isLoaded ? `animate-slideInLeft animate-delay-${(i + 2) * 100}` : 'opacity-0'}`}>
                <h4 className="text-2xl font-bold text-accent-soft mb-3" style={{ fontFamily: 'var(--font-display)' }}>{value.title}</h4>
                <p className="text-gray-300 leading-relaxed text-lg">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gold-fill CTA with black text — pin the dark (bright) gold so the fill
          stays legible; the light theme's darker gold would kill the contrast. */}
      <section data-theme="dark" className="bg-gradient-to-br from-accent-soft to-accent-soft-deep text-black py-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h3 className={`text-4xl font-bold mb-6 ${isLoaded ? 'animate-fadeInUp' : 'opacity-0'}`} style={{ fontFamily: 'var(--font-display)' }}>
            Ready to Take Control of Your Financial Future?
          </h3>
          <p className={`text-lg mb-10 text-black/80 leading-relaxed max-w-2xl mx-auto ${isLoaded ? 'animate-fadeInUp animate-delay-200' : 'opacity-0'}`}>
            Schedule a complimentary consultation to explore investment products and opportunities.
          </p>
          <button
            onClick={() => onNavigate('client-login')}
            className={`bg-black hover:bg-gray-900 text-white font-bold py-4 px-10 rounded-md transition-all duration-300 shadow-lg hover:shadow-xl text-lg ${isLoaded ? 'animate-fadeInUp animate-delay-400 animate-pulse-subtle' : 'opacity-0'}`}
          >
            Create Your Account
          </button>
        </div>
      </section>

      <section id="contact" className="py-20 px-6 bg-bg-base">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-4xl font-bold text-center text-text-primary mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Get in Touch
          </h3>
          <div className="w-24 h-1 bg-accent-soft mx-auto mb-16"></div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className={`bg-gradient-to-br from-black to-gray-900 rounded-xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 group ${isLoaded ? 'animate-fadeInUp animate-delay-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-accent-soft p-4 rounded-full group-hover:scale-110 transition-transform duration-300">
                  <Phone className="w-8 h-8 text-black" />
                </div>
                <h4 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                  Phone
                </h4>
              </div>
              <a
                href="tel:+918939433113"
                className="text-accent-soft hover:text-white text-xl font-medium transition-colors duration-300 block"
              >
                +91 8939433113
              </a>
            </div>

            <div className={`bg-gradient-to-br from-black to-gray-900 rounded-xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 group ${isLoaded ? 'animate-fadeInUp animate-delay-300' : 'opacity-0'}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-accent-soft p-4 rounded-full group-hover:scale-110 transition-transform duration-300">
                  <Mail className="w-8 h-8 text-black" />
                </div>
                <h4 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                  Email
                </h4>
              </div>
              <a
                href="mailto:support@niyomwealth.com"
                className="text-accent-soft hover:text-white text-xl font-medium transition-colors duration-300 block break-words"
              >
                support@niyomwealth.com
              </a>
            </div>

            <div className={`bg-gradient-to-br from-black to-gray-900 rounded-xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 group ${isLoaded ? 'animate-fadeInUp animate-delay-500' : 'opacity-0'}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-accent-soft p-4 rounded-full group-hover:scale-110 transition-transform duration-300">
                  <MessageCircle className="w-8 h-8 text-black" />
                </div>
                <h4 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                  WhatsApp
                </h4>
              </div>
              <a
                href="https://wa.me/918939433113?text=Hello,%20I%20wish%20to%20get%20in%20touch%20with%20you"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-soft hover:text-white text-xl font-medium transition-colors duration-300 block"
              >
                +91 8939433113
              </a>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-text-secondary text-lg leading-relaxed max-w-2xl mx-auto">
              We're here to answer your questions and help you achieve your financial goals. Reach out to us via phone, email, or WhatsApp, and our team will get back to you promptly.
            </p>
          </div>
        </div>
      </section>

      <footer className="bg-black text-white py-12 px-6 border-t border-accent-soft/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="flex flex-col items-center md:items-start gap-3">
              <Logo size="sm" />
              <div>
                <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-body)', letterSpacing: '0.1em' }}>NIYOM WEALTH</h2>
                <p className="text-text-muted text-sm mt-1">Distribution LLP</p>
              </div>
            </div>

            <div className="text-center md:text-left">
              <h3 className="text-lg font-semibold text-accent-soft mb-4">Legal</h3>
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => onNavigate('privacy')}
                  className="text-text-muted hover:text-accent-soft transition-colors text-left"
                >
                  Privacy Policy
                </button>
                <button
                  onClick={() => onNavigate('terms')}
                  className="text-text-muted hover:text-accent-soft transition-colors text-left"
                >
                  Terms of Use
                </button>
                <button
                  onClick={() => onNavigate('risk')}
                  className="text-text-muted hover:text-accent-soft transition-colors text-left"
                >
                  Risk Disclosure
                </button>
                <button
                  onClick={() => onNavigate('disclaimer')}
                  className="text-text-muted hover:text-accent-soft transition-colors text-left"
                >
                  Disclaimer
                </button>
              </div>
            </div>

            <div className="text-center md:text-left">
              <h3 className="text-lg font-semibold text-accent-soft mb-4">Connect With Us</h3>
              <div className="flex flex-col space-y-3">
                <a
                  href="https://www.linkedin.com/company/niyom-wealth/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-text-muted hover:text-accent-soft transition-colors justify-center md:justify-start group"
                >
                  <Linkedin size={20} className="group-hover:scale-110 transition-transform duration-300" />
                  <span>LinkedIn</span>
                </a>
                <a
                  href="https://www.instagram.com/niyom_wealth?igsh=MXRvaXB2ejJ0Z2h1cA=="
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-text-muted hover:text-accent-soft transition-colors justify-center md:justify-start group"
                >
                  <Instagram size={20} className="group-hover:scale-110 transition-transform duration-300" />
                  <span>Instagram</span>
                </a>
              </div>
            </div>
          </div>

          <RegulatoryInfo />

          <div className="text-center text-text-muted pt-8 border-t border-gray-800">
            <p className="text-sm">&copy; 2025 Niyom Wealth Distribution LLP. All rights reserved.</p>
            <p className="text-xs mt-3 text-yellow-400 font-semibold">
              SEBI Disclaimer: We are not SEBI Registered Investment Advisers.
            </p>
            <p className="text-xs mt-2 text-text-muted">
              Investments in securities market are subject to market risks. Read all scheme related documents carefully before investing. We do not provide personalized investment advice. All information provided is for educational and informational purposes only. Please consult a qualified financial advisor before making investment decisions.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
