// Live margin → selling-price calculator, shared by the detail screen and the
// marketing-PDF flow.
//
// Admin: has the confidential landing cost, so it computes locally and instantly,
//        and may use a Manual price override.
// Employee: never receives landing cost — it calls the nw_bond_selling_price RPC
//        (debounced) so the server computes the price from the hidden cost.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { MarginType } from './bondTypes';
import { MARGIN_PRESETS } from './bondConstants';
import { computeSellingPrice, formatINRFull, formatINR } from './bondUtils';
import { computeSellingPriceServer } from './bondService';

export interface MarginState { marginType: MarginType; marginValue: number | null; sellingPrice: number | null; }

interface Props {
  bondId: string;
  isAdmin: boolean;
  landingCost?: number | null;      // admin only
  defaultSellingPrice?: number | null;
  onChange?: (state: MarginState) => void;
  compact?: boolean;
}

export default function BondMarginCalculator({ bondId, isAdmin, landingCost, defaultSellingPrice, onChange, compact }: Props) {
  const [marginType, setMarginType] = useState<MarginType>('percent');
  const [marginValue, setMarginValue] = useState<number | null>(2);
  const [sellingPrice, setSellingPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const emit = useCallback((s: MarginState) => onChange?.(s), [onChange]);

  // Recompute whenever inputs change.
  useEffect(() => {
    if (isAdmin) {
      const base = landingCost ?? null;
      const price = base !== null
        ? computeSellingPrice(base, marginType, marginValue)
        : (marginType === 'manual' && marginValue ? marginValue : defaultSellingPrice ?? null);
      setSellingPrice(price);
      emit({ marginType, marginValue, sellingPrice: price });
      return;
    }
    // Employee: ask the server (debounced), never touching landing cost.
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const price = await computeSellingPriceServer(bondId, marginType, marginValue);
      if (mine !== seq.current) return; // a newer request superseded this one
      const resolved = price ?? defaultSellingPrice ?? null;
      setSellingPrice(resolved);
      setLoading(false);
      emit({ marginType, marginValue, sellingPrice: resolved });
    }, 300);
    return () => clearTimeout(t);
  }, [bondId, isAdmin, landingCost, defaultSellingPrice, marginType, marginValue, emit]);

  const presetActive = (v: number) => marginType === 'percent' && marginValue === v;

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Margin Calculator</span>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Landing Cost (internal)</span>
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {landingCost !== null && landingCost !== undefined ? formatINRFull(landingCost) : 'Not set'}
          </span>
        </div>
      )}

      {/* Margin presets */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {MARGIN_PRESETS.map(p => (
          <button key={p.value} onClick={() => { setMarginType('percent'); setMarginValue(p.value); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{
              background: presetActive(p.value) ? 'var(--accent)' : 'var(--bg-surface)',
              color: presetActive(p.value) ? 'var(--text-on-accent)' : 'var(--text-secondary)',
              border: `1px solid ${presetActive(p.value) ? 'var(--accent)' : 'var(--border)'}`,
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Type + value */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <select value={marginType} onChange={e => setMarginType(e.target.value as MarginType)}
          className="px-3 py-2 rounded-xl text-sm outline-none appearance-none cursor-pointer"
          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
          <option value="percent">Percentage %</option>
          <option value="flat">Flat Amount ₹</option>
          {isAdmin && <option value="manual">Manual Price</option>}
        </select>
        <input type="number" step="0.01" value={marginValue ?? ''} onChange={e => setMarginValue(e.target.value === '' ? null : parseFloat(e.target.value))}
          placeholder={marginType === 'percent' ? 'e.g. 2.50' : marginType === 'flat' ? 'e.g. 1500' : 'Enter price'}
          className="px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
      </div>

      {/* Result */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
        <span className="text-xs font-bold uppercase tracking-wider text-on-accent" style={{ opacity: 0.9 }}>Selling Price</span>
        <span className="text-lg font-extrabold text-on-accent flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {sellingPrice !== null ? (compact ? formatINR(sellingPrice) : formatINRFull(sellingPrice)) : 'On Request'}
        </span>
      </div>

      {!isAdmin && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--text-faint)' }}>
          Landing cost is confidential. Selling price is computed securely on the server.
        </p>
      )}
    </div>
  );
}
