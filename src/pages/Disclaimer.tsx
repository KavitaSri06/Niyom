import { useEffect } from 'react';
import { X, ArrowLeft, ShieldAlert } from 'lucide-react';
import { LegalSection } from '../components/LegalDocumentLayout';

interface DisclaimerProps {
  onClose: () => void;
}

// Editable for future compliance updates — change this single value when the
// disclaimer content is revised.
const LAST_UPDATED = 'February 13, 2026';

const COMPANY = 'Niyom Wealth Distribution LLP';

export function Disclaimer({ onClose }: DisclaimerProps) {
  // SEO-friendly title + description; restored on unmount.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Disclaimer | Niyom Wealth Distribution LLP';
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? null;
    if (meta) {
      meta.setAttribute(
        'content',
        'Disclaimer — Mutual Fund investment risk and SEBI NAV applicability guidelines for Niyom Wealth Distribution LLP.',
      );
    }
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc !== null) meta.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-2xl border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-5 flex justify-between items-center">
          <button
            onClick={onClose}
            aria-label="Back to home"
            className="flex items-center gap-3 hover:text-[#c9b896] transition-all duration-300 font-medium group"
          >
            <ArrowLeft size={22} className="group-hover:-translate-x-1 transition-transform" />
            <span className="tracking-wide text-sm uppercase">Back to Home</span>
          </button>
          <button
            onClick={onClose}
            aria-label="Close disclaimer"
            className="text-white hover:text-[#c9b896] transition-colors p-2 hover:bg-slate-700 rounded-lg"
          >
            <X size={26} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        <article className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header area */}
          <div className="bg-gradient-to-r from-slate-50 to-white p-8 sm:p-12 border-b-2 border-slate-200">
            <div className="flex items-start gap-6 mb-6">
              <div className="flex-shrink-0" aria-hidden="true">
                <ShieldAlert className="w-16 h-16 text-[#c9b896]" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h1
                  className="text-4xl sm:text-5xl font-bold text-slate-900 mb-3 leading-tight"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: '-0.025em' }}
                >
                  Disclaimer
                </h1>
                <p className="text-lg text-slate-600 font-light tracking-wide">{COMPANY}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700 uppercase tracking-wider">Last Updated:</span>
              <span className="text-slate-600">{LAST_UPDATED}</span>
            </div>
          </div>

          {/* Compliance content */}
          <div className="p-8 sm:p-12">
            <LegalSection number="1" title="Mutual Fund Investment Risk">
              <p>
                Mutual Fund investments are subject to market risks and there is no assurance or
                guarantee that the objective of the Scheme will be achieved. Past performance of the
                Sponsor, AMC, Fund or any scheme of the Fund does not indicate the future performance
                of the Schemes of the Fund. Please read the Key Information Memorandum (KIM), Scheme
                Information Document (SID), and all scheme-related offer documents carefully before
                investing.
              </p>
            </LegalSection>

            <LegalSection number="2" title="SEBI Circular — NAV Applicability (Debt / Income Schemes)">
              <p>
                SEBI has vide its circular dated November 26, 2010, stipulated that with respect to
                purchase of units of income/debt-oriented schemes (other than liquid schemes) with an
                investment amount equal to or exceeding ₹1 Crore, irrespective of the time of
                application, the applicable NAV shall be the closing NAV of the day on which funds are
                available for utilization.
              </p>
              <p>
                Investors are advised to take note of the above SEBI guidelines while investing in
                income/debt-oriented schemes (other than liquid schemes).
              </p>
            </LegalSection>
          </div>

          {/* Document footer */}
          <div className="border-t-2 border-slate-200 bg-slate-50 px-8 sm:px-12 py-8 text-center">
            <p
              className="text-base font-semibold text-slate-800"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              {COMPANY}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              &copy; 2026 Niyom Wealth Distribution LLP. All Rights Reserved.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
