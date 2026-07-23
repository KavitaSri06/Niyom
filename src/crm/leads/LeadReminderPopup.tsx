import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NWEmployee } from '../types';
import { BellRing, CheckCircle2, Clock, ChevronRight, X, ExternalLink } from 'lucide-react';
import { NWLeadFollowup, LeadPriority } from './leadTypes';
import { CALL_OUTCOMES } from './leadConstants';
import { Select, Textarea, Input, PrimaryButton, GhostButton } from './leadUi';
import { relativeTime, formatDateTime } from './leadUtils';

interface FRow extends NWLeadFollowup { lead?: { id: string; lead_name: string; lead_code: string; mobile: string } | null; }

interface Props {
  employee: NWEmployee;
  onOpenLead: (leadId: string) => void;
}

const POLL_MS = 60_000;
const SNOOZE_KEY = 'nw_lead_reminder_snooze';
const SNOOZE_MS = 15 * 60_000;   // 15 minutes

// Snooze state persists across view switches (the popup remounts as the user
// navigates the Leads module) so a snoozed reminder doesn't immediately re-pop.
function readSnooze(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; }
}
function writeSnooze(s: Record<string, number>) {
  try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export default function LeadReminderPopup({ employee, onOpenLead }: Props) {
  const [queue, setQueue] = useState<FRow[]>([]);
  const [mode, setMode] = useState<'remind' | 'feedback'>('remind');
  const [done, setDone] = useState(false);          // brief "updated" confirmation
  const [busy, setBusy] = useState(false);

  // Feedback form
  const [outcome, setOutcome] = useState<string>('Connected');
  const [remarks, setRemarks] = useState('');
  const [reschedule, setReschedule] = useState('');

  const timer = useRef<ReturnType<typeof setInterval>>();

  const fetchDue = useCallback(async () => {
    const snooze = readSnooze();
    const now = Date.now();
    const { data } = await supabase.from('nw_lead_followups')
      .select('*, lead:nw_leads(id, lead_name, lead_code, mobile)')
      .eq('employee_id', employee.id)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(50);
    const rows = ((data as unknown as FRow[]) || []).filter(r => !(snooze[r.id] && snooze[r.id] > now));
    setQueue(rows);
  }, [employee.id]);

  useEffect(() => {
    fetchDue();
    timer.current = setInterval(fetchDue, POLL_MS);
    return () => clearInterval(timer.current);
  }, [fetchDue]);

  const current = queue[0];

  // Reset the form whenever a new reminder surfaces.
  useEffect(() => {
    setMode('remind'); setDone(false); setOutcome('Connected'); setRemarks(''); setReschedule('');
  }, [current?.id]);

  const advance = () => setQueue(q => q.slice(1));

  const snooze = () => {
    if (!current) return;
    const s = readSnooze(); s[current.id] = Date.now() + SNOOZE_MS; writeSnooze(s);
    advance();
  };

  const logActivity = (leadId: string, action: string, description: string) =>
    supabase.from('nw_lead_activities').insert([{ lead_id: leadId, employee_id: employee.id, action, description }]);

  // Quick confirm — mark the follow-up done.
  const confirmDone = async () => {
    if (!current) return;
    setBusy(true);
    await supabase.from('nw_lead_followups').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', current.id);
    if (current.lead) await logActivity(current.lead.id, 'Reminder Completed', `${current.purpose || 'Follow-up'} confirmed done`);
    setBusy(false); flashAndAdvance();
  };

  // Update with feedback — record outcome/remarks, complete this follow-up, and
  // optionally schedule the next one.
  const submitFeedback = async () => {
    if (!current) return;
    setBusy(true);
    await supabase.from('nw_lead_followups')
      .update({ status: 'completed', completed_at: new Date().toISOString(), outcome })
      .eq('id', current.id);
    if (current.lead) {
      await logActivity(current.lead.id, 'Follow-up Completed', `${outcome}${remarks.trim() ? ' — ' + remarks.trim() : ''}`);
    }
    if (reschedule && current.lead) {
      await supabase.from('nw_lead_followups').insert([{
        lead_id: current.lead.id, employee_id: employee.id, scheduled_at: new Date(reschedule).toISOString(),
        priority: current.priority as LeadPriority, mode: current.mode, purpose: current.purpose || 'Follow-up',
        reminder_minutes: current.reminder_minutes ?? 30,
      }]);
      await logActivity(current.lead.id, 'Follow-up Added', `Rescheduled to ${new Date(reschedule).toLocaleString('en-IN')}`);
    }
    setBusy(false); flashAndAdvance();
  };

  const flashAndAdvance = () => {
    setDone(true);
    setTimeout(() => { setDone(false); advance(); }, 900);
  };

  const overdueLabel = useMemo(() => {
    if (!current) return '';
    const late = Date.now() - new Date(current.scheduled_at).getTime();
    return late > 0 ? `Overdue · was due ${relativeTime(current.scheduled_at)}` : `Due ${formatDateTime(current.scheduled_at)}`;
  }, [current]);

  if (!current) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[85] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl overflow-hidden"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: 'rgba(249,115,22,0.1)', borderBottom: '1px solid var(--border)' }}>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(249,115,22,0.15)' }}>
          <BellRing className="w-4 h-4" style={{ color: 'rgb(249,115,22)' }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Follow-up Reminder</p>
          {queue.length > 1 && <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{queue.length} due · showing 1</p>}
        </div>
        <button onClick={snooze} title="Snooze 15 min" className="p-1 rounded-lg" style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
      </div>

      {done ? (
        <div className="px-4 py-8 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--success)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Follow-up updated</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Lead summary */}
          <button onClick={() => current.lead && onOpenLead(current.lead.id)} className="w-full text-left flex items-start gap-2 group">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                {current.lead?.lead_name || 'Lead'} <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60" />
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {current.purpose || 'Follow-up'} · <span className="capitalize">{current.mode.replace('_', ' ')}</span>
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger)' }}>
            <Clock className="w-3 h-3" /> {overdueLabel}
          </div>

          {mode === 'remind' ? (
            <div className="flex items-center gap-2 pt-1">
              <PrimaryButton onClick={confirmDone} disabled={busy} className="!py-2 !px-3 flex-1 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Confirm Done
              </PrimaryButton>
              <button onClick={() => setMode('feedback')} disabled={busy}
                className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Update <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Outcome</label>
                <Select value={outcome} onChange={e => setOutcome(e.target.value)}>
                  {CALL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Feedback / Remarks</label>
                <Textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="What happened?" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Reschedule (optional)</label>
                <Input type="datetime-local" value={reschedule} onChange={e => setReschedule(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <GhostButton onClick={() => setMode('remind')} className="!py-2 !px-3">Back</GhostButton>
                <PrimaryButton onClick={submitFeedback} disabled={busy} className="!py-2 !px-3 flex-1">
                  {busy ? 'Saving…' : 'Save Feedback'}
                </PrimaryButton>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button onClick={snooze} className="text-[11px] font-semibold" style={{ color: 'var(--text-faint)' }}>Snooze 15 min</button>
            {queue.length > 1 && <button onClick={advance} className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Skip →</button>}
          </div>
        </div>
      )}
    </div>
  );
}
