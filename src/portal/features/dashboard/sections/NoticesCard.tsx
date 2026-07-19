import { Bell } from 'lucide-react';
import { timeAgo } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { SectionHeader } from '../../../components/SectionHeader';
import type { Notice } from '../../../types';

const DOT: Record<Notice['tone'], string> = {
  info: 'var(--info)',
  success: 'var(--success)',
  warning: 'var(--warning)',
};

export function NoticesCard({ notices }: { notices: Notice[] }) {
  const isMock = notices.some((n) => n.isMock);

  return (
    <Card className="animate-fadeInUp animate-delay-400">
      <SectionHeader title="Latest Notices" icon={Bell} isMock={isMock} />
      <ul className="space-y-3">
        {notices.map((n) => (
          <li key={n.id} className="flex gap-3">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: DOT[n.tone] }}
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary">{n.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">{n.body}</p>
              <p className="mt-1 text-[10px] text-text-faint">{timeAgo(n.date)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
