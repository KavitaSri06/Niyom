import { Headphones, Mail, MessageSquare, Phone } from 'lucide-react';
import { Card } from '../../../components/Card';

/**
 * Relationship-manager / support strip. Contact details are NIYOM-level
 * placeholders until an RM-assignment field is wired from the CRM.
 */
export function SupportCard() {
  return (
    <Card className="animate-fadeInUp animate-delay-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-token-lg bg-accent/10">
            <Headphones className="h-5 w-5 text-accent" />
          </span>
          <div>
            <p className="text-sm font-bold text-text-primary">Need help with your investments?</p>
            <p className="text-xs text-text-secondary">
              Your NIYOM relationship team is available Mon–Sat, 9am–7pm.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="tel:+919999999999"
            className="flex items-center gap-2 rounded-token-md border border-border bg-bg-surface px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
          <a
            href="mailto:support@niyomwealth.com"
            className="flex items-center gap-2 rounded-token-md border border-border bg-bg-surface px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
          <button
            type="button"
            className="flex items-center gap-2 rounded-token-md px-3 py-2 text-xs font-bold text-on-accent"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Raise a Ticket
          </button>
        </div>
      </div>
    </Card>
  );
}
