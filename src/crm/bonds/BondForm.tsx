// Admin create / edit form for a bond master record. Full field coverage grouped
// into sections; confidential fields (landing cost, internal notes, admin remarks)
// live in their own clearly-labelled block. Not using RHF/Zod — matches the
// project's controlled-form convention (see LeadForm).

import { useState } from 'react';
import { NWBond, BondStatus } from './bondTypes';
import { BOND_STATUSES } from './bondConstants';
import { computeSellingPrice } from './bondUtils';
import { updateBond } from './bondService';
import { supabase } from '../../lib/supabase';
import { Drawer, Field, Input, Textarea, Select, PrimaryButton, GhostButton } from '../leads/leadUi';

interface Props {
  mode: 'create' | 'edit';
  bond: NWBond | null;
  employeeId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

type FormState = Record<string, string>;

// Every editable field as a string (empty = null for numeric/date on save).
const FIELDS_TEXT = [
  'company_name', 'issuer', 'isin', 'bond_name', 'security_type', 'security_category',
  'seniority', 'listing_exchange', 'tax_status', 'face_value_text', 'minimum_investment',
  'multiples', 'available_quantity', 'issue_size', 'coupon_text', 'maturity_text',
  'tenure', 'rating', 'rating_agency', 'interest_frequency', 'interest_payment_dates',
  'put_option', 'call_option', 'principal_repayment', 'credit_enhancement', 'trustee',
  'remarks', 'notes', 'footnotes', 'disclaimers', 'internal_notes', 'admin_remarks',
];
const FIELDS_NUM = ['face_value', 'purchase_price', 'landing_cost', 'selling_price', 'default_margin_value', 'coupon', 'yield_ytm', 'ytc_ytp'];
const FIELDS_DATE = ['maturity_date'];

function initState(bond: NWBond | null): FormState {
  const s: FormState = {};
  [...FIELDS_TEXT, ...FIELDS_NUM, ...FIELDS_DATE].forEach(k => {
    const v = bond ? (bond as unknown as Record<string, unknown>)[k] : '';
    s[k] = v === null || v === undefined ? '' : String(v);
  });
  s.status = bond?.status ?? 'Available';
  s.default_margin_type = bond?.default_margin_type ?? 'none';
  return s;
}

export default function BondForm({ mode, bond, employeeId, onClose, onSaved }: Props) {
  const [f, setF] = useState<FormState>(() => initState(bond));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));

  // Existing (cost) price to mark up from: explicit landing cost if set, else the
  // imported price (Price Per 100). Selling price = existing price + % increase.
  const basePrice = f.landing_cost !== '' ? parseFloat(f.landing_cost)
    : f.purchase_price !== '' ? parseFloat(f.purchase_price) : null;
  const previewPrice = computeSellingPrice(
    basePrice, 'percent',
    f.default_margin_value === '' ? null : parseFloat(f.default_margin_value),
  );

  const buildPayload = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    FIELDS_TEXT.forEach(k => { out[k] = f[k] ?? ''; });
    FIELDS_NUM.forEach(k => { out[k] = f[k] === '' ? null : parseFloat(f[k]); });
    FIELDS_DATE.forEach(k => { out[k] = f[k] === '' ? null : f[k]; });
    out.status = f.status as BondStatus;
    // Single-knob model: the default margin is always a percentage increase.
    out.default_margin_type = f.default_margin_value === '' ? 'none' : 'percent';
    // If the admin set a % but no explicit selling price, apply the preview.
    if ((out.selling_price === null || out.selling_price === undefined) && previewPrice !== null) {
      out.selling_price = previewPrice;
    }
    return out;
  };

  const save = async () => {
    if (!f.company_name.trim() && !f.bond_name.trim()) { setError('Company or bond name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const payload = buildPayload();
      if (mode === 'edit' && bond) {
        payload.modified_by = employeeId;
        const err = await updateBond(bond.id, payload as Partial<NWBond>);
        if (err) { setError(err); setSaving(false); return; }
        onSaved(bond.id);
      } else {
        payload.source = 'manual';
        payload.created_by = employeeId;
        payload.modified_by = employeeId;
        const { data, error: insErr } = await supabase.from('nw_bonds').insert(payload).select('id').single();
        if (insErr) { setError(insErr.message); setSaving(false); return; }
        onSaved(data.id as string);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
      setSaving(false);
    }
  };

  const T = (k: string, label: string, required?: boolean) => (
    <Field label={label} required={required}><Input value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></Field>
  );
  const N = (k: string, label: string) => (
    <Field label={label}><Input type="number" step="0.0001" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></Field>
  );
  const TA = (k: string, label: string) => (
    <Field label={label}><Textarea value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></Field>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xs font-bold uppercase tracking-widest mt-2 mb-1 col-span-2" style={{ color: 'var(--accent)' }}>{children}</h3>
  );

  return (
    <Drawer open onClose={onClose} width="max-w-3xl"
      title={mode === 'create' ? 'New Bond' : `Edit ${bond?.bond_code ?? 'Bond'}`}
      subtitle={mode === 'edit' ? bond?.bond_name : 'Add a bond to the master database'}
      footer={
        <div className="flex items-center justify-between gap-3">
          {error ? <span className="text-xs" style={{ color: 'rgb(239,68,68)' }}>{error}</span> : <span />}
          <div className="flex items-center gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Create Bond' : 'Save Changes'}</PrimaryButton>
          </div>
        </div>
      }>
      <div className="grid grid-cols-2 gap-4">
        <SectionTitle>General</SectionTitle>
        {T('company_name', 'Company Name', true)}
        {T('issuer', 'Issuer')}
        {T('isin', 'ISIN')}
        {T('bond_name', 'Bond Name')}
        {T('security_type', 'Security Type')}
        {T('security_category', 'Security Category')}
        {T('seniority', 'Seniority')}
        {T('listing_exchange', 'Listing Exchange')}
        {T('tax_status', 'Tax Status')}
        <Field label="Status"><Select value={f.status} onChange={e => set('status', e.target.value)}>{BOND_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>

        <SectionTitle>Coupon &amp; Yield</SectionTitle>
        {N('coupon', 'Coupon %')}
        {N('yield_ytm', 'Yield (YTM) %')}
        {N('ytc_ytp', 'YTC / YTP %')}
        {T('coupon_text', 'Coupon (display text)')}

        <SectionTitle>Interest &amp; Redemption</SectionTitle>
        {T('interest_frequency', 'Interest Frequency')}
        {T('interest_payment_dates', 'Interest Payment Dates')}
        <Field label="Maturity Date"><Input type="date" value={f.maturity_date ?? ''} onChange={e => set('maturity_date', e.target.value)} /></Field>
        {T('tenure', 'Tenure')}
        {T('put_option', 'Put Option')}
        {T('call_option', 'Call Option')}
        {T('principal_repayment', 'Principal Repayment')}
        {T('credit_enhancement', 'Credit Enhancement')}
        {T('trustee', 'Trustee')}
        {TA('maturity_text', 'Maturity / Redemption Detail')}

        <SectionTitle>Rating</SectionTitle>
        {T('rating', 'Rating')}
        {T('rating_agency', 'Rating Agency')}

        <SectionTitle>Quantity &amp; Face Value</SectionTitle>
        {T('face_value_text', 'Face Value (text)')}
        {N('face_value', 'Face Value (number)')}
        {T('minimum_investment', 'Minimum Investment')}
        {T('multiples', 'Multiples')}
        {T('available_quantity', 'Available Quantity')}
        {T('issue_size', 'Issue Size')}

        <SectionTitle>Pricing — Internal (Admin only)</SectionTitle>
        {N('purchase_price', 'Existing Price (per 100)')}
        {N('default_margin_value', '% Increase')}
        {N('selling_price', 'Selling Price (client-facing)')}
        <div className="flex items-end pb-1">
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {previewPrice !== null
              ? `Selling price = existing price + ${f.default_margin_value || 0}% → ₹${previewPrice.toLocaleString('en-IN')}. Leave "Selling Price" blank to use this.`
              : 'Enter the existing price and a % increase to preview the selling price.'}
          </p>
        </div>

        <SectionTitle>Notes &amp; Disclaimers</SectionTitle>
        {TA('remarks', 'Remarks (public)')}
        {TA('notes', 'Notes (public)')}
        {TA('footnotes', 'Footnotes (public)')}
        {TA('disclaimers', 'Disclaimers (public)')}
        {TA('internal_notes', 'Internal Notes (admin only)')}
        {TA('admin_remarks', 'Admin Remarks (admin only)')}
      </div>
    </Drawer>
  );
}
