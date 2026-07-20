// Bond Creation — top-level container. Switches between the database list, the
// admin upload/verify flow, and the bond detail screen. Mirrors the Leads
// container pattern.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NWEmployee, CRMPage } from '../types';
import { NWBond } from './bondTypes';
import { isAdminRole } from './bondUtils';
import BondList from './BondList';
import BondUpload from './BondUpload';
import BondDetail from './BondDetail';
import BondForm from './BondForm';

interface Props {
  employee: NWEmployee;
  onNavigate?: (page: CRMPage, params?: Record<string, string>) => void;
  pageParams?: Record<string, string>;
}

type View = 'list' | 'upload' | 'detail';
type FormState = { open: boolean; mode: 'create' | 'edit'; bond: NWBond | null };

export default function Bonds({ employee, pageParams }: Props) {
  const isAdmin = isAdminRole(employee);
  const [view, setView] = useState<View>('list');
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState<FormState>({ open: false, mode: 'create', bond: null });
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const bump = () => setRefreshKey(k => k + 1);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Resolve the current employee's row id (created_by / uploaded_by / owner).
  useEffect(() => {
    supabase.from('nw_employees').select('id').eq('auth_user_id', employee.auth_user_id).maybeSingle()
      .then(({ data }) => setEmployeeId((data?.id as string) ?? employee.id ?? null));
  }, [employee.auth_user_id, employee.id]);

  // Deep link: /crm/bonds?bondId=… opens a detail directly.
  useEffect(() => {
    if (pageParams?.bondId) { setOpenId(pageParams.bondId); setView('detail'); }
  }, [pageParams?.bondId]);

  const openDetail = (id: string) => { setOpenId(id); setView('detail'); };

  if (view === 'upload' && isAdmin) {
    return (
      <>
        <BondUpload employee={employee} employeeId={employeeId}
          onBack={() => setView('list')}
          onDone={count => { setView('list'); bump(); flash(`${count} bond${count === 1 ? '' : 's'} added`); }} />
        {toast && <Toast text={toast} />}
      </>
    );
  }

  if (view === 'detail' && openId) {
    return (
      <>
        <BondDetail employee={employee} bondId={openId} refreshKey={refreshKey}
          onBack={() => { setView('list'); setOpenId(null); bump(); }}
          onEdit={b => setForm({ open: true, mode: 'edit', bond: b })}
          onChanged={bump} />
        {form.open && isAdmin && (
          <BondForm mode={form.mode} bond={form.bond} employeeId={employeeId}
            onClose={() => setForm(f => ({ ...f, open: false }))}
            onSaved={() => { setForm(f => ({ ...f, open: false })); flash('Bond updated'); bump(); }} />
        )}
        {toast && <Toast text={toast} />}
      </>
    );
  }

  return (
    <>
      <BondList employee={employee} refreshKey={refreshKey}
        onOpen={openDetail}
        onUpload={() => setView('upload')}
        onNew={() => setForm({ open: true, mode: 'create', bond: null })} />
      {form.open && isAdmin && (
        <BondForm mode={form.mode} bond={form.bond} employeeId={employeeId}
          onClose={() => setForm(f => ({ ...f, open: false }))}
          onSaved={id => { setForm(f => ({ ...f, open: false })); flash(form.mode === 'create' ? 'Bond created' : 'Bond updated'); bump(); openDetail(id); }} />
      )}
      {toast && <Toast text={toast} />}
    </>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold"
      style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>{text}</div>
  );
}
