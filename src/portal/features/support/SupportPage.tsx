import { useState } from 'react';
import {
  ChevronDown,
  Headphones,
  Mail,
  MessageSquare,
  Phone,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '../../components/Card';

const CONTACTS: Array<{ icon: LucideIcon; label: string; value: string; href: string }> = [
  { icon: Phone, label: 'Call us', value: '+91 99999 99999', href: 'tel:+919999999999' },
  { icon: Mail, label: 'Email', value: 'support@niyomwealth.com', href: 'mailto:support@niyomwealth.com' },
  { icon: MessageSquare, label: 'WhatsApp', value: 'Chat with us', href: 'https://wa.me/919999999999' },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How long does a mutual fund purchase take to reflect?',
    a: 'Orders placed before the 3:00 PM BSE StAR MF cut-off are processed at the same day’s NAV. Units typically reflect in your portfolio within 1–2 working days after fund realisation.',
  },
  {
    q: 'How do I redeem or switch my investments?',
    a: 'Open Mutual Funds → My Funds, then choose Redeem or Switch on any holding. Redemptions are credited to your registered bank account per the fund’s settlement cycle.',
  },
  {
    q: 'Can I change my registered bank account?',
    a: 'Bank and KYC changes are regulated and require verification. Contact your relationship manager and we’ll guide you through the process securely.',
  },
  {
    q: 'Where can I download my statements?',
    a: 'Reports → download your Transaction or Holdings statement as an Excel workbook. Capital Gains and the official CAS will be available in a later update.',
  },
  {
    q: 'Is my data secure?',
    a: 'Your portal is private to you. Documents are served over short-lived secure links and sensitive account numbers are masked on screen.',
  },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border-subtle last:border-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 py-3.5 text-left">
        <span className="text-sm font-semibold text-text-primary">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-3.5 text-xs leading-relaxed text-text-secondary">{a}</p>}
    </div>
  );
}

export function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="space-y-5">
      {/* RM hero */}
      <Card accent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-token-xl bg-accent/10">
              <Headphones className="h-5 w-5 text-accent" />
            </span>
            <div>
              <p className="text-sm font-bold text-text-primary">Your relationship team is here to help</p>
              <p className="text-xs text-text-secondary">Available Mon–Sat, 9:00 AM – 7:00 PM IST.</p>
            </div>
          </div>
          <a
            href="mailto:support@niyomwealth.com?subject=Support%20request"
            className="inline-flex items-center justify-center gap-2 rounded-token-md px-4 py-2.5 text-sm font-bold text-on-accent"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
          >
            <MessageSquare className="h-4 w-4" /> Raise a Ticket
          </a>
        </div>
      </Card>

      {/* Contact methods */}
      <div className="grid gap-4 sm:grid-cols-3">
        {CONTACTS.map((c) => (
          <a
            key={c.label}
            href={c.href}
            target={c.href.startsWith('http') ? '_blank' : undefined}
            rel="noopener"
            className="lift flex items-center gap-3 rounded-token-xl border border-border bg-bg-elevated p-4 shadow-token-card transition-colors hover:border-accent/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-token-lg bg-accent/10">
              <c.icon className="h-5 w-5 text-accent" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-text-faint">{c.label}</p>
              <p className="truncate text-sm font-semibold text-text-primary">{c.value}</p>
            </div>
          </a>
        ))}
      </div>

      {/* FAQ */}
      <Card>
        <h3 className="mb-1 text-sm font-bold text-text-primary">Frequently Asked Questions</h3>
        <div>
          {FAQS.map((f, i) => (
            <FaqItem key={f.q} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </Card>
    </div>
  );
}
