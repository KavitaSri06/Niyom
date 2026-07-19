import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NWLead } from './leadTypes';
import { Modal, PrimaryButton, GhostButton } from './leadUi';
import { StatusBadge } from './leadUi';
import { AlertCircle, ArrowRight, GitMerge } from 'lucide-react';
import { formatDate, formatMoney } from './leadUtils';

interface Props {
  leadA: NWLead;
  leadB: NWLead;
  onClose: () => void;
  onMerged: () => void;
}

// Admin folds one lead (duplicate) into another (primary). All history moves to
// the primary; the duplicate is archived + locked as a tombstone.
export default function LeadMergeModal({ leadA, leadB, onClose, onMerged }: Props) {
  const [primaryId, setPrimaryId] = useState(leadA.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const primary = primaryId === leadA.id ? leadA : leadB;
  const duplicate = primaryId === leadA.id ? leadB : leadA;

  const merge = async () => {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('nw_merge_leads', { p_primary: primary.id, p_duplicate: duplicate.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onMerged();
  };

  return (
    <Modal open onClose={onClose} title="Merge Duplicate Leads" width="max-w-lg">
      <div className="space-y-4">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Choose which lead to <strong>keep</strong>. The other's notes, calls, follow-ups,
          documents and audit history move into it, and it is archived &amp; locked.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {[leadA, leadB].map(l => {
            const keep = primaryId === l.id;
            return (
              <button key={l.id} onClick={() => setPrimaryId(l.id)}
                className="text-left p-3 rounded-xl transition-all"
                style={{ background: keep ? 'rgba(16,185,129,0.08)' : 'var(--bg-base)', border: `2px solid ${keep ? 'var(--success)' : 'var(--border)'}` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: keep ? 'rgba(16,185,129,0.15)' : 'var(--bg-raised)', color: keep ? 'var(--success)' : 'var(--text-faint)' }}>
                    {keep ? 'Keep' : 'Merge away'}
                  </span>
                </div>
                <p className="text-sm font-bold mt-1.5 truncate" style={{ color: 'var(--text-primary)' }}>{l.lead_name}</p>
                <p className="text-[11px] font-mono" style={{ color: 'var(--accent)' }}>{l.lead_code}</p>
                <div className="mt-1.5"><StatusBadge status={l.status} small /></div>
                <div className="mt-2 space-y-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  <p>{l.mobile || '—'} · {l.owner?.full_name || 'Pool'}</p>
                  <p>{formatMoney(l.investment_capacity)} · {formatDate(l.created_at)}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-mono font-bold" style={{ color: 'var(--danger)' }}>{duplicate.lead_code}</span>
          <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
          <span className="font-mono font-bold" style={{ color: 'var(--success)' }}>{primary.lead_code}</span>
        </div>

        {err && (
          <div className="p-2.5 rounded-lg flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <GhostButton onClick={onClose} className="!py-2 !px-4">Cancel</GhostButton>
          <PrimaryButton onClick={merge} disabled={busy} className="!py-2 !px-4 flex items-center gap-2">
            <GitMerge className="w-4 h-4" /> {busy ? 'Merging…' : 'Merge Leads'}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
