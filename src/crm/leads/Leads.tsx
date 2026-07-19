import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NWEmployee, CRMPage } from '../types';
import { NWLead } from './leadTypes';
import LeadList from './LeadList';
import LeadForm from './LeadForm';
import LeadAssignModal from './LeadAssignModal';

interface Props {
  employee: NWEmployee;
  onNavigate: (page: CRMPage, params?: Record<string, string>) => void;
  pageParams?: Record<string, string>;
}

const LEAD_SELECT =
  '*, owner:nw_employees!nw_leads_owner_employee_id_fkey(full_name, employee_code), ' +
  'created_by:nw_employees!nw_leads_created_by_employee_id_fkey(full_name, employee_code)';

type FormState = { open: boolean; mode: 'create' | 'edit'; lead: NWLead | null };

export default function Leads({ employee }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState<FormState>({ open: false, mode: 'create', lead: null });
  const [assign, setAssign] = useState<{ open: boolean; leads: NWLead[] }>({ open: false, leads: [] });
  const [toast, setToast] = useState<string>('');

  const bump = () => setRefreshKey(k => k + 1);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openExisting = useCallback(async (leadId: string) => {
    const { data } = await supabase.from('nw_leads').select(LEAD_SELECT).eq('id', leadId).single();
    if (data) setForm({ open: true, mode: 'edit', lead: data as unknown as NWLead });
  }, []);

  return (
    <div>
      <LeadList
        employee={employee}
        refreshKey={refreshKey}
        onNew={() => setForm({ open: true, mode: 'create', lead: null })}
        onOpen={l => setForm({ open: true, mode: 'edit', lead: l })}
        onEdit={l => setForm({ open: true, mode: 'edit', lead: l })}
        onAssign={leads => setAssign({ open: true, leads })}
      />

      {form.open && (
        <LeadForm
          employee={employee}
          mode={form.mode}
          lead={form.lead}
          onClose={() => setForm(f => ({ ...f, open: false }))}
          onSaved={() => {
            setForm(f => ({ ...f, open: false }));
            flash(form.mode === 'create' ? 'Lead created' : 'Lead updated');
            bump();
          }}
          onOpenExisting={openExisting}
        />
      )}

      {assign.open && (
        <LeadAssignModal
          leads={assign.leads}
          onClose={() => setAssign({ open: false, leads: [] })}
          onAssigned={count => {
            setAssign({ open: false, leads: [] });
            flash(`${count} lead${count === 1 ? '' : 's'} assigned`);
            bump();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
