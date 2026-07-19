import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NWEmployee } from '../types';
import { Modal, GhostButton, StatusBadge } from './leadUi';
import { ShieldAlert, ExternalLink, Check, Inbox } from 'lucide-react';
import { formatDateTime } from './leadUtils';

interface DupRequest {
  id: string;
  existing_lead_id: string | null;
  payload: Record<string, any>;
  created_at: string;
  requester?: { full_name: string } | null;
  existing?: { lead_name: string; lead_code: string; status: string } | null;
}

interface Props {
  employee: NWEmployee;
  onClose: () => void;
  onOpenLead: (leadId: string) => void;
  onChanged: () => void;
}

const SELECT =
  '*, requester:nw_employees!nw_lead_duplicate_requests_requested_by_employee_id_fkey(full_name), ' +
  'existing:nw_leads!nw_lead_duplicate_requests_existing_lead_id_fkey(lead_name, lead_code, status)';

export default function LeadDuplicateQueue({ employee, onClose, onOpenLead, onChanged }: Props) {
  const [rows, setRows] = useState<DupRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('nw_lead_duplicate_requests').select(SELECT)
      .eq('status', 'pending').order('created_at', { ascending: false });
    setRows((data as unknown as DupRequest[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const dismiss = async (id: string) => {
    await supabase.from('nw_lead_duplicate_requests').update({ status: 'reviewed', reviewed_by: employee.id }).eq('id', id);
    load(); onChanged();
  };

  return (
    <Modal open onClose={onClose} title="Duplicate Review Requests" width="max-w-2xl">
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-faint)' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-10">
            <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No pending duplicate requests</p>
          </div>
        ) : rows.map(r => (
          <div key={r.id} className="p-3.5 rounded-xl" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgb(var(--warning-soft-rgb))' }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {r.requester?.full_name || 'An employee'} flagged a possible duplicate
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{formatDateTime(r.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {r.existing_lead_id && (
                  <button onClick={() => { onOpenLead(r.existing_lead_id!); onClose(); }}
                    className="text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg" style={{ color: 'var(--accent)' }}>
                    Open <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => dismiss(r.id)}
                  className="text-xs font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <Check className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {/* attempted */}
              <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Attempted entry</p>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{r.payload?.lead_name || '—'}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{r.payload?.mobile || '—'} · {r.payload?.email || '—'}</p>
              </div>
              {/* existing match */}
              <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Existing lead</p>
                {r.existing ? (
                  <>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{r.existing.lead_name} <span className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>{r.existing.lead_code}</span></p>
                    <div className="mt-1"><StatusBadge status={r.existing.status} small /></div>
                  </>
                ) : <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Matched an existing client (not a lead).</p>}
              </div>
            </div>
          </div>
        ))}
        <div className="flex justify-end pt-1">
          <GhostButton onClick={onClose} className="!py-2 !px-4">Close</GhostButton>
        </div>
      </div>
    </Modal>
  );
}
