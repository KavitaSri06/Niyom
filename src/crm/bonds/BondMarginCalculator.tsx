// Live "% increase from the existing price" → selling-price calculator, shared by
// the detail screen and the marketing-PDF flow.
//
// One control: a percentage to increase from the bond's existing (cost) price.
// Admin: has the confidential base price, so it computes locally and instantly.
// Employee: never receives the base — it calls the nw_bond_selling_price RPC
//           (debounced) so the server computes the price from the hidden base.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, Loader2, Percent } from 'lucide-react';
import { MarginType } from './bondTypes';
import { MARGIN_PRESETS } from './bondConstants';
import { computeSellingPrice, formatINRFull, formatINR } from './bondUtils';
import { computeSellingPriceServer } from './bondService';

export interface MarginState { marginType: MarginType; marginValue: number | null; sellingPrice: number | null; }

interface Props {
  bondId: string;
  isAdmin: boolean;
  basePrice?: number | null;        // admin only — the existing/cost price to mark up from
  defaultSellingPrice?: number | null;
  onChange?: (state: MarginState) => void;
  compact?: boolean;
}

export default function BondMarginCalculator({ bondId, isAdmin, basePrice, defaultSellingPrice, onChange, compact }: Props) {
  const [percent, setPercent] = useState<number | null>(2);
  const [sellingPrice, setSellingPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const emit = useCallback((s: MarginState) => onChange?.(s), [onChange]);

  // Recompute whenever the % or base changes.
  useEffect(() => {
    if (isAdmin) {
      const base = basePrice ?? null;
      const price = base !== null
        ? computeSellingPrice(base, 'percent', percent)
        : defaultSellingPrice ?? null;
      setSellingPrice(price);
      emit({ marginType: 'percent', marginValue: percent, sellingPrice: price });
      return;
    }
    // Employee: ask the server (debounced), never touching the base price.
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const price = await computeSellingPriceServer(bondId, 'percent', percent);
      if (mine !== seq.current) return; // a newer request superseded this one
      const resolved = price ?? defaultSellingPrice ?? null;
      setSellingPrice(resolved);
      setLoading(false);
      emit({ marginType: 'percent', marginValue: percent, sellingPrice: resolved });
    }, 300);
    return () => clearTimeout(t);
  }, [bondId, isAdmin, basePrice, defaultSellingPrice, percent, emit]);

  const presetActive = (v: number) => percent === v;

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Margin Calculator</span>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Existing Price (internal)</span>
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {basePrice !== null && basePrice !== undefined ? formatINRFull(basePrice) : 'Not set'}
          </span>
        </div>
      )}

      {/* % presets */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {MARGIN_PRESETS.map(p => (
          <button key={p.value} onClick={() => setPercent(p.value)}
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

      {/* Single % increase control */}
      <div className="mb-3">
        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>% Increase from existing price</label>
        <div className="relative">
          <Percent className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          <input type="number" step="0.01" value={percent ?? ''} onChange={e => setPercent(e.target.value === '' ? null : parseFloat(e.target.value))}
            placeholder="e.g. 2.50"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
        </div>
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
          The base price is confidential. Selling price is computed securely on the server.
        </p>
      )}
    </div>
  );
}
