import { ShieldCheck } from 'lucide-react';
import { Card } from '../../../components/Card';
import { SectionHeader } from '../../../components/SectionHeader';
import { StatusPill } from '../../../components/StatusPill';
import type { NWClient } from '../../../../crm/types';

const KYC_TONE = {
  verified: 'success',
  partial: 'warning',
  pending: 'warning',
  rejected: 'danger',
} as const;

export function AccountSummaryCard({ client }: { client: NWClient | null }) {
  if (!client) return null;

  const status = client.verification_status;
  const tone = KYC_TONE[status] ?? 'muted';

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Client Code', value: client.client_code },
    { label: 'PAN', value: client.pan },
    { label: 'Mobile', value: client.phone },
    { label: 'Email', value: client.email },
    { label: 'Bank', value: client.bank_name || '—' },
    { label: 'City', value: [client.city, client.state].filter(Boolean).join(', ') || '—' },
  ];

  return (
    <Card className="animate-fadeInUp animate-delay-100">
      <SectionHeader
        title="Account Summary"
        icon={ShieldCheck}
        action={
          <StatusPill tone={tone}>
            KYC {status.charAt(0).toUpperCase() + status.slice(1)}
          </StatusPill>
        }
      />
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-3 rounded-token-md bg-bg-surface px-3 py-2.5"
          >
            <dt className="w-20 shrink-0 text-xs text-text-secondary">{r.label}</dt>
            <dd className="truncate text-xs font-medium text-text-primary">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
