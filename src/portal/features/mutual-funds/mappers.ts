/**
 * MF holding view model + mapper.
 * -----------------------------------------------------------------------------
 * Turns a client's `nw_holdings` mutual-fund rows into the shape the My Funds /
 * Redeem / Switch screens need, and best-effort links each to a BSE scheme code
 * by name so those actions can reference the scheme when the live gateway lands.
 */
import type { NWHolding } from '../../../crm/types';
import type { FundScheme } from '../../types/funds';

export interface MfHolding {
  id: string;
  schemeName: string;
  amc?: string;
  folioNumber?: string;
  units: number;
  nav: number;
  value: number;
  invested: number;
  gain: number;
  gainPercent: number;
  /** Resolved BSE code when the holding matches a catalog scheme. */
  schemeCode?: string;
}

export function mapHoldingToMf(h: NWHolding, schemes: FundScheme[]): MfHolding {
  const value = h.current_value || 0;
  const invested = h.invested_amount || 0;
  const units = h.quantity || 0;
  const nav = h.current_nav ?? (units > 0 ? value / units : 0);
  const match = schemes.find(
    (s) => s.name.toLowerCase() === (h.product_name || '').toLowerCase(),
  );
  return {
    id: h.id,
    schemeName: h.product_name,
    amc: h.fund_house,
    folioNumber: h.folio_number,
    units,
    nav,
    value,
    invested,
    gain: value - invested,
    gainPercent: invested > 0 ? ((value - invested) / invested) * 100 : 0,
    schemeCode: match?.schemeCode,
  };
}

export function mapMfHoldings(holdings: NWHolding[], schemes: FundScheme[]): MfHolding[] {
  return holdings
    .filter((h) => h.product_type === 'mutual_fund')
    .map((h) => mapHoldingToMf(h, schemes))
    .sort((a, b) => b.value - a.value);
}
