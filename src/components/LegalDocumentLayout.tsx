import { X, ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';

interface LegalDocumentLayoutProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function LegalDocumentLayout({ title, subtitle, icon, onClose, children }: LegalDocumentLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-2xl border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-8 py-5 flex justify-between items-center">
          <button
            onClick={onClose}
            className="flex items-center gap-3 hover:text-[#c9b896] transition-all duration-300 font-medium group"
          >
            <ArrowLeft size={22} className="group-hover:-translate-x-1 transition-transform" />
            <span className="tracking-wide text-sm uppercase">Back to Home</span>
          </button>
          <button
            onClick={onClose}
            className="text-white hover:text-[#c9b896] transition-colors p-2 hover:bg-slate-700 rounded-lg"
          >
            <X size={26} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-white p-8 sm:p-12 border-b-2 border-slate-200">
            <div className="flex items-start gap-6 mb-6">
              {icon && <div className="flex-shrink-0">{icon}</div>}
              <div className="flex-1">
                <h1
                  className="text-4xl sm:text-5xl font-bold text-slate-900 mb-3 leading-tight"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: '-0.025em' }}
                >
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-lg text-slate-600 font-light tracking-wide">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700 uppercase tracking-wider">Effective Date:</span>
              <span className="text-slate-600">February 13, 2026</span>
            </div>
          </div>

          <div className="p-8 sm:p-12">
            {children}
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-slate-500">
          <p>&copy; 2025 Niyom Wealth Management LLP. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  number: string;
  title: string;
  children: ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'info';
}

export function LegalSection({ number, title, children, variant = 'default' }: SectionProps) {
  const bgColors = {
    default: '',
    warning: 'bg-amber-50 border-l-4 border-amber-500',
    danger: 'bg-red-50 border-l-4 border-red-600',
    info: 'bg-blue-50 border-l-4 border-blue-500'
  };

  const containerClass = variant === 'default'
    ? 'mb-10'
    : `mb-10 p-6 rounded-r-lg ${bgColors[variant]}`;

  return (
    <section className={containerClass}>
      <h2
        className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 flex items-baseline gap-3"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        <span className="text-[#c9b896]">{number}.</span>
        <span>{title}</span>
      </h2>
      <div className="space-y-3 text-slate-700" style={{ fontSize: '14px', lineHeight: '1.6' }}>
        {children}
      </div>
    </section>
  );
}

interface SubsectionProps {
  number: string;
  title: string;
  children: ReactNode;
}

export function LegalSubsection({ number, title, children }: SubsectionProps) {
  return (
    <div className="mt-5 mb-5">
      <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-baseline gap-2">
        <span className="text-[#c9b896]">{number}</span>
        <span>{title}</span>
      </h3>
      <div className="space-y-3" style={{ fontSize: '14px', lineHeight: '1.6' }}>
        {children}
      </div>
    </div>
  );
}

interface LegalListProps {
  items: ReactNode[];
  ordered?: boolean;
}

export function LegalList({ items, ordered = false }: LegalListProps) {
  const ListTag = ordered ? 'ol' : 'ul';
  const listClass = ordered ? 'list-decimal' : 'list-disc';

  return (
    <ListTag className={`${listClass} pl-6 space-y-2 text-slate-700`} style={{ fontSize: '14px', lineHeight: '1.6' }}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ListTag>
  );
}

interface AlertBoxProps {
  type: 'warning' | 'danger' | 'info' | 'success';
  children: ReactNode;
}

export function AlertBox({ type, children }: AlertBoxProps) {
  const styles = {
    warning: 'bg-amber-50 border-amber-300 text-amber-900',
    danger: 'bg-red-50 border-red-300 text-red-900',
    info: 'bg-blue-50 border-blue-300 text-blue-900',
    success: 'bg-green-50 border-green-300 text-green-900'
  };

  return (
    <div className={`border-2 ${styles[type]} p-5 rounded-lg font-medium`} style={{ fontSize: '14px', lineHeight: '1.6' }}>
      {children}
    </div>
  );
}

interface ContactBoxProps {
  company: string;
  email: string;
  phone: string;
}

export function ContactBox({ company, email, phone }: ContactBoxProps) {
  return (
    <div className="bg-slate-50 border-2 border-slate-200 p-6 rounded-lg" style={{ fontSize: '14px', lineHeight: '1.6' }}>
      <p className="font-bold text-slate-900 mb-3" style={{ fontSize: '16px' }}>{company}</p>
      <div className="space-y-1.5 text-slate-700">
        <p><span className="font-semibold">Email:</span> {email}</p>
        <p><span className="font-semibold">Phone:</span> {phone}</p>
      </div>
    </div>
  );
}
