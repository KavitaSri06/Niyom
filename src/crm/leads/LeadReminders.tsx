import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NWEmployee } from '../types';
import { CalendarClock, CheckCircle2, AlertTriangle, Clock, CalendarDays } from 'lucide-react';
import { NWLeadFollowup } from './leadTypes';
import { formatDateTime, relativeTime } from './leadUtils';

interface FollowupRow extends NWLeadFollowup {
  lead?: { id: string; lead_name: string; lead_code: string } | null;
}

type Bucket = 'overdue' | 'today' | 'upcoming' | 'missed';

interface Props {
  employee: NWEmployee;
  refreshKey: number;
  onOpenLead: (leadId: string) => void;
  onChanged?: () => void;
}

const BUCKET_META: Record<Bucket, { label: string; rgb: string; icon: any }> = {
  overdue:  { label: 'Overdue',   rgb: '239,68,68',  icon: AlertTriangle },
  today:    { label: "Today",     rgb: '249,115,22', icon: Clock },
  upcoming: { label: 'Upcoming',  rgb: '59,130,246', icon: CalendarDays },
  missed:   { label: 'Missed',    rgb: '148,163,184', icon: CalendarClock },
};

export default function LeadReminders({ employee, refreshKey, onOpenLead, onChanged }: Props) {
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Bucket>('today');

  const load = useCallback(async () => {
    setLoading(true);
    // RLS already limits follow-ups to leads the user can see.
    const { data } = await supabase.from('nw_lead_followups')
      .select('*, lead:nw_leads(id, lead_name, lead_code)')
      .in('status', ['pending', 'missed'])
      .order('scheduled_at', { ascending: true })
      .limit(300);
    setRows((data as unknown as FollowupRow[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const buckets = useMemo(() => {
    const now = Date.now();
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const b: Record<Bucket, FollowupRow[]> = { overdue: [], today: [], upcoming: [], missed: [] };
    for (const r of rows) {
      if (r.status === 'missed') { b.missed.push(r); continue; }
      const t = new Date(r.scheduled_at).getTime();
      if (t < now) b.overdue.push(r);
      else if (t <= todayEnd.getTime()) b.today.push(r);
      else b.upcoming.push(r);
    }
    return b;
  }, [rows]);

  const complete = async (r: FollowupRow) => {
    await supabase.from('nw_lead_followups').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', r.id);
    if (r.lead) await supabase.from('nw_lead_activities').insert([{ lead_id: r.lead.id, employee_id: employee.id, action: 'Reminder Completed', description: `${r.purpose || 'Follow-up'} marked complete` }]);
    load(); onChanged?.();
  };

  const items = buckets[tab];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <CalendarClock className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Reminders
        </h3>
      </div>
      {/* Bucket tabs */}
      <div className="flex items-center gap-1 px-3 pt-2 flex-wrap">
        {(Object.keys(BUCKET_META) as Bucket[]).map(k => {
          const m = BUCKET_META[k]; const n = buckets[k].length; const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors"
              style={{ background: active ? `rgba(${m.rgb},0.12)` : 'transparent', color: active ? `rgb(${m.rgb})` : 'var(--text-faint)' }}>
              <m.icon className="w-3.5 h-3.5" /> {m.label}
              <span className="px-1.5 rounded-full text-[10px] font-bold" style={{ background: `rgba(${m.rgb},0.15)`, color: `rgb(${m.rgb})` }}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="p-3 max-h-96 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--text-faint)' }}>Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-faint)' }}>Nothing here — you're all caught up.</p>
        ) : items.map(r => {
          const m = BUCKET_META[tab];
          return (
            <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl mb-1.5" style={{ background: 'var(--bg-base)', border: `1px solid rgba(${m.rgb},0.25)` }}>
              <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: `rgb(${m.rgb})` }} />
              <button onClick={() => r.lead && onOpenLead(r.lead.id)} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{r.lead?.lead_name || 'Lead'}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {r.purpose || 'Follow-up'} · <span className="capitalize">{r.mode.replace('_', ' ')}</span> · {tab === 'upcoming' ? formatDateTime(r.scheduled_at) : relativeTime(r.scheduled_at)}
                </p>
              </button>
              {r.status === 'pending' && (
                <button onClick={() => complete(r)} className="flex-shrink-0 p-1.5 rounded-lg" title="Mark done" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
