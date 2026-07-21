// Bond Creation module — per-bond cashflow statement PDF.
//
// Mirrors a distributor cashflow statement: bond details, investment details
// (units, settlement, principal + accrued = investment amount), and a dated
// interest-receivable schedule with partial redemptions and 10% TDS. Built from
// the confidential-safe catalog + the client price only. All figures indicative.

import html2pdf from 'html2pdf.js';
import { NWBondCatalog } from './bondTypes';
import { NIYOM_BRAND } from './bondConstants';
import { formatDate, formatINRFull, formatPercent, inferFrequency } from './bondUtils';
import { buildCashflow, CashflowResult, TDS_RATE } from './bondCashflow';

const NIYOM_LOGO = '/niyomlogo.png';
const NIYOM = {
  name: 'NIYOM WEALTH DISTRIBUTION LLP',
  tagline: 'Wealth Distribution & Advisory',
  address: 'No 126, 1st Floor, Poonamalle High Road, Varalakshmi Nagar, Maduravoyal, Chennai – 600 095',
  email: 'support@niyomwealth.com',
  web: 'www.niyomwealth.com',
};

export interface EmployeeContact { name: string; phone?: string; email?: string; designation?: string; }

export interface CashflowPdfOptions {
  quantity: number;
  pricePer100: number | null;
  contact?: EmployeeContact;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
function safe(v: unknown): string { const s = String(v ?? '').trim(); return s && s.toUpperCase() !== 'NA' ? esc(s) : ''; }
function num(v: number): string { return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function detailRow(label: string, value: string): string {
  if (!value) return '';
  const { ink, line } = NIYOM_BRAND;
  return `<tr><td style="padding:5px 10px;font-size:10.5px;color:#5a6b85;border-bottom:1px solid ${line};white-space:nowrap;">${label}</td>
    <td style="padding:5px 10px;font-size:10.5px;color:${ink};font-weight:600;border-bottom:1px solid ${line};text-align:right;">${value}</td></tr>`;
}

function buildHtml(bond: NWBondCatalog, cf: CashflowResult, opts: CashflowPdfOptions): string {
  const { darkBlue, navy, gold, goldSoft, white, ink, mist, line } = NIYOM_BRAND;
  const payout = inferFrequency(bond.interest_frequency, bond.interest_payment_dates) || '—';
  const couponStr = bond.coupon !== null ? `${formatPercent(bond.coupon)} (Fixed)` : safe(bond.coupon_text);

  const scheduleRows = cf.rows.map(r => `
    <tr>
      <td style="padding:6px 8px;font-size:10px;border-bottom:1px solid ${line};">${formatDate(r.date)}</td>
      <td style="padding:6px 8px;font-size:10px;text-align:right;border-bottom:1px solid ${line};">${r.faceRedeemed > 0 ? num(r.faceRedeemed) : ''}</td>
      <td style="padding:6px 8px;font-size:10px;text-align:right;border-bottom:1px solid ${line};">${num(r.interest)}</td>
      <td style="padding:6px 8px;font-size:10px;text-align:right;border-bottom:1px solid ${line};font-weight:600;">${num(r.total)}</td>
      <td style="padding:6px 8px;font-size:10px;text-align:right;border-bottom:1px solid ${line};color:#0f6e56;font-weight:600;">${num(r.netAfterTds)}</td>
      <td style="padding:6px 8px;font-size:9px;border-bottom:1px solid ${line};color:#8a5a12;">${r.remark}</td>
    </tr>`).join('');

  const contact = opts.contact;

  return `
  <div style="width:794px;box-sizing:border-box;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:${white};color:${ink};">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,${darkBlue} 0%,${navy} 100%);padding:22px 34px;color:${white};display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="${NIYOM_LOGO}" alt="Niyom Wealth" style="height:40px;width:auto;object-fit:contain;" />
        <div>
          <div style="font-size:15px;font-weight:800;">NIYOM WEALTH</div>
          <div style="font-size:8.5px;letter-spacing:0.16em;text-transform:uppercase;color:${goldSoft};">${NIYOM.tagline}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;font-weight:800;color:${goldSoft};letter-spacing:0.04em;">CASHFLOW STATEMENT</div>
        <div style="font-size:9px;color:#cfd8ea;margin-top:2px;">ISIN: ${safe(bond.isin) || '—'}</div>
      </div>
    </div>

    <!-- Bond + Investment detail (two columns) -->
    <div style="padding:20px 34px 6px;display:flex;gap:22px;">
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid ${gold};padding-bottom:5px;margin-bottom:4px;">Bond Details</div>
        <table style="width:100%;border-collapse:collapse;">
          ${detailRow('Issuer', safe(bond.issuer) || safe(bond.company_name))}
          ${detailRow('ISIN', safe(bond.isin))}
          ${detailRow('Credit Rating', safe(bond.rating))}
          ${detailRow('Payment Terms', payout)}
          ${detailRow('Face Value / Unit', safe(bond.face_value_text) || (bond.face_value ? formatINRFull(bond.face_value) : ''))}
          ${detailRow('Coupon', couponStr)}
          ${detailRow('Maturity Date', cf.maturityDate ? formatDate(cf.maturityDate) : safe(bond.maturity_text))}
          ${detailRow('Security', safe(bond.security_type))}
          ${detailRow('Seniority', safe(bond.seniority))}
          ${detailRow('Listed', safe(bond.listing_exchange) ? 'YES' : '')}
        </table>
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid ${gold};padding-bottom:5px;margin-bottom:4px;">Investment Details</div>
        <table style="width:100%;border-collapse:collapse;">
          ${detailRow('Units Selected', `${opts.quantity.toLocaleString('en-IN')} Units`)}
          ${detailRow('Settlement Date', formatDate(cf.settlementDate))}
          ${detailRow('Price (per ₹100)', opts.pricePer100 !== null ? formatINRFull(opts.pricePer100) : '—')}
          ${detailRow('Principal Amount', formatINRFull(cf.principalAmount))}
          ${detailRow('Accrued Interest', formatINRFull(cf.accruedInterest))}
        </table>
        <div style="margin-top:8px;background:linear-gradient(135deg,${darkBlue},${navy});border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${goldSoft};font-weight:700;">Investment Amount</span>
          <span style="font-size:18px;font-weight:900;color:${white};">${formatINRFull(cf.investmentAmount)}</span>
        </div>
        <div style="font-size:8.5px;color:#8592a8;margin-top:5px;">Investment Amount = Principal + Accrued Interest.</div>
        ${cf.exInterest ? `<div style="font-size:8.5px;color:#8a5a12;margin-top:4px;line-height:1.4;">Purchased <strong>ex-interest</strong>: settlement falls in the record-date window, so the upcoming coupon is paid to the registered holder on the record date. A negative accrued (rebate) is applied and that coupon is excluded below.</div>` : ''}
      </div>
    </div>

    <!-- Schedule -->
    <div style="padding:14px 34px 6px;">
      <div style="font-size:11px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid ${gold};padding-bottom:5px;margin-bottom:8px;">Interest Receivable Schedule${cf.assumedBullet ? '' : ' (with partial redemption)'}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:${mist};">
            <th style="padding:7px 8px;font-size:9.5px;text-align:left;color:${navy};border-bottom:2px solid ${gold};">Date</th>
            <th style="padding:7px 8px;font-size:9.5px;text-align:right;color:${navy};border-bottom:2px solid ${gold};">Principal (₹)</th>
            <th style="padding:7px 8px;font-size:9.5px;text-align:right;color:${navy};border-bottom:2px solid ${gold};">Interest (₹)</th>
            <th style="padding:7px 8px;font-size:9.5px;text-align:right;color:${navy};border-bottom:2px solid ${gold};">Total (₹)</th>
            <th style="padding:7px 8px;font-size:9.5px;text-align:right;color:${navy};border-bottom:2px solid ${gold};">Net − ${Math.round(TDS_RATE * 100)}% TDS (₹)</th>
            <th style="padding:7px 8px;font-size:9.5px;text-align:left;color:${navy};border-bottom:2px solid ${gold};">Remarks</th>
          </tr>
        </thead>
        <tbody>${scheduleRows}</tbody>
        <tfoot>
          <tr style="background:${mist};font-weight:800;">
            <td style="padding:7px 8px;font-size:10px;color:${navy};">Total</td>
            <td style="padding:7px 8px;font-size:10px;text-align:right;color:${navy};">${num(cf.totalPrincipalReturned)}</td>
            <td style="padding:7px 8px;font-size:10px;text-align:right;color:${navy};">${num(cf.totalInterest)}</td>
            <td style="padding:7px 8px;font-size:10px;text-align:right;color:${navy};">${num(cf.totalPrincipalReturned + cf.totalInterest)}</td>
            <td style="padding:7px 8px;font-size:10px;text-align:right;color:${navy};">${num(cf.totalPrincipalReturned + cf.totalInterest * (1 - TDS_RATE))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Disclaimer + contact -->
    <div style="margin:12px 34px 0;padding:10px 14px;background:#fbfbfd;border:1px solid ${line};border-radius:8px;">
      <div style="font-size:8px;color:#6b7688;line-height:1.5;text-align:justify;">
        <strong style="color:${navy};">Indicative:</strong> Actual interest dates/amounts may vary with bank holidays and issuer terms. ${Math.round(TDS_RATE * 100)}% TDS shown is for resident individuals (30% for NRIs); submit Form 15G/15H or claim credit in your ITR as applicable. Yields assume the bond is held to maturity. Partial-redemption terms are as read from the offer document. Niyom Wealth Distribution LLP acts as a distributor and does not guarantee returns.
      </div>
    </div>

    <div style="margin-top:12px;background:linear-gradient(135deg,${darkBlue} 0%,${navy} 100%);color:${white};padding:14px 34px;display:flex;justify-content:space-between;align-items:flex-end;">
      <div style="font-size:9px;line-height:1.5;color:#cfd8ea;">
        <div style="font-weight:800;color:${white};font-size:10.5px;">${NIYOM.name}</div>
        <div>${NIYOM.address}</div>
        <div>${NIYOM.email} &nbsp;•&nbsp; ${NIYOM.web}</div>
      </div>
      ${contact ? `<div style="text-align:right;font-size:9px;color:#e7eefb;">
        <div style="font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:${goldSoft};">Your Relationship Manager</div>
        <div style="font-weight:800;color:${white};font-size:11px;margin-top:2px;">${esc(contact.name)}</div>
        ${contact.designation ? `<div style="color:${goldSoft};">${esc(contact.designation)}</div>` : ''}
        ${contact.phone ? `<div>${esc(contact.phone)}</div>` : ''}
        ${contact.email ? `<div>${esc(contact.email)}</div>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => (img.complete && img.naturalWidth > 0)
    ? Promise.resolve()
    : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); })));
}

export async function generateCashflowPdf(bond: NWBondCatalog, opts: CashflowPdfOptions): Promise<CashflowResult> {
  const cf = buildCashflow({
    faceValuePerUnit: bond.face_value, coupon: bond.coupon, maturityISO: bond.maturity_date,
    frequencyHint: bond.interest_frequency, ipDates: bond.interest_payment_dates,
    redemptionText: bond.maturity_text, quantity: opts.quantity, cleanPricePer100: opts.pricePer100,
  });
  if (!cf.ok) return cf; // caller surfaces cf.reason

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = buildHtml(bond, cf, opts);
  document.body.appendChild(container);
  try {
    await waitForImages(container);
    const base = `NIYOM_Cashflow_${(bond.isin || bond.bond_code || 'bond').replace(/[^\w]+/g, '_')}`;
    const opt = {
      margin: [8, 0, 8, 0] as [number, number, number, number],
      filename: `${base}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
      jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy', 'avoid-all'] as string[] },
    };
    await html2pdf().set(opt).from(container.firstElementChild as HTMLElement).save();
  } finally {
    document.body.removeChild(container);
  }
  return cf;
}
