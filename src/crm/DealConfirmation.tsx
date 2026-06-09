import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWClient } from './types';
import {
  FileText, Plus, Search, ChevronDown, Eye, Pencil, Trash2,
  Download, CheckCircle2, AlertCircle, ChevronLeft, Mail,
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface Props { employee: NWEmployee; }

interface DealForm {
  client_id: string;
  deal_date: string;
  transaction_type: 'Buy' | 'Sell' | '';
  product_type: string;
  security_name: string;
  isin: string;
  quantity: string;
  base_rate: string;       // raw value user types
  rate_per_unit: string;   // adjusted = base_rate - (base_rate * 0.015/100)
  notes: string;
}

interface DealRecord {
  id: string;
  confirmation_number: string;
  client_id: string;
  employee_id: string;
  status: 'draft' | 'confirmed';
  deal_date: string;
  transaction_type: string;
  product_type: string;
  security_name: string;
  isin: string;
  quantity: number;
  rate_per_unit: number;
  settlement_amount: number;
  stamp_duty: number;
  snap_client_name: string;
  snap_pan: string;
  snap_dp_name: string;
  snap_demat_account: string;
  snap_depository?: string;
  snap_bank_name: string;
  snap_bank_account: string;
  snap_bank_ifsc: string;
  snap_address: string;
  snap_phone: string;
  snap_email: string;
  notes: string;
  created_at: string;
  email_status: 'pending' | 'sent';
  email_sent_at?: string;
  email_sent_by?: string;
  client?: { full_name: string; client_code: string };
}

const PRODUCT_TYPES = [
  'Unlisted Share', 'Secondary Bond', 'Primary Bond', 'Fixed Deposit', 'Mutual Fund', 'Insurance', 'Other',
];

const emptyForm = (): DealForm => ({
  client_id: '',
  deal_date: new Date().toISOString().split('T')[0],
  transaction_type: '',
  product_type: '',
  security_name: '',
  isin: '',
  quantity: '',
  base_rate: '',
  rate_per_unit: '',
  notes: '',
});

function adjustRate(base: string): string {
  const n = parseFloat(base);
  if (!base || isNaN(n) || n <= 0) return '';
  return (Math.round((n - n * 0.015 / 100) * 100) / 100).toFixed(2);
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRole(role: string): string {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'admin': return 'Admin';
    case 'employee': return 'Relationship Manager';
    default: return 'Staff';
  }
}

// ---------- Read-only field ----------
function ROField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>{label}</label>
      <div className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
        style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)', color: '#A8A8A8' }}>
        {value || '—'}
      </div>
    </div>
  );
}

// ---------- Editable field ----------
function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8A8A8A' }}>
        {label}{required && <span className="ml-0.5" style={{ color: '#D4AF37' }}>*</span>}
      </label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: '#4A4A4A' }}>{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input {...props}
      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none transition-all"
      style={{ background: '#050505', border: `1px solid ${focused ? '#D4AF37' : '#1E1E24'}` }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ---------- Email Status Badge ----------
function EmailStatusBadge({ status }: { status: 'pending' | 'sent' }) {
  if (status === 'sent') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
        style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.18)' }}
      >
        <CheckCircle2 className="w-3 h-3" />
        Email Sent
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
      style={{ background: 'rgba(107,107,107,0.1)', color: '#6B6B6B', border: '1px solid rgba(107,107,107,0.18)' }}
    >
      Pending
    </span>
  );
}

// ---------- PDF generator (browser print / download) — UNCHANGED ----------
function generatePDF(deal: DealRecord, clientCode: string) {
  const dpId = deal.snap_demat_account ? deal.snap_demat_account.slice(0, 8) : '—';
  const clientIdDP = deal.snap_demat_account ? deal.snap_demat_account.slice(-8) : '—';
  const settleFmt = (n: number) => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numFmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Deal Confirmation — ${deal.confirmation_number}</title>
  <style>
    @page { margin: 14mm 12mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #111; background: #fff; }

    /* Watermark */
    .watermark {
      position: fixed; bottom: 60px; right: 20px;
      opacity: 0.06; width: 260px;
      pointer-events: none;
    }

    .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 2px solid #111; }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-left img { height: 54px; width: auto; }
    .tagline { font-family: Georgia, serif; font-size: 14px; color: #8B7355; font-style: italic; }
    .deal-note-title { font-size: 16px; font-weight: 900; letter-spacing: 0.08em; color: #111; text-align: right; }

    .section-title { font-size: 11px; font-weight: 800; margin: 14px 0 6px 0; color: #111; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #bbb; padding: 6px 10px; font-size: 9.5px; }
    th { background: #f5f5f5; font-weight: 700; text-align: center; }

    .label-col { width: 38%; background: #fafafa; font-weight: 500; color: #333; text-align: center; }
    .val-col { text-align: center; }

    .split-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .split-table th { font-weight: 800; font-size: 10px; background: #f0f0f0; padding: 7px 10px; text-align: center; border: 1px solid #bbb; }
    .split-table td { border: 1px solid #bbb; padding: 6px 10px; font-size: 9.5px; }
    .split-label { background: #fafafa; color: #333; width: 24%; }
    .split-val { text-align: center; width: 26%; }

    .payment-table { width: 55%; margin: 0 auto 12px auto; }
    .payment-table th { background: #f0f0f0; font-weight: 800; text-align: center; }

    .tc-title { font-size: 12px; font-weight: 900; margin: 16px 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em; }
    .tc-item { margin-bottom: 7px; }
    .tc-item-title { font-weight: 800; font-size: 9.5px; margin-bottom: 2px; }
    .tc-item-body { font-size: 9px; color: #333; line-height: 1.45; }

    .confirm-title { font-size: 10px; margin: 14px 0 8px 0; }

    .sign-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .sign-table td { border: 1px solid #bbb; padding: 12px 14px; vertical-align: top; width: 50%; }
    .sign-title { font-weight: 700; font-size: 10px; background: #f5f5f5; padding: 5px 10px; border-bottom: 1px solid #bbb; }

    .footer { text-align: center; font-size: 9px; color: #888; margin-top: 20px; padding-top: 8px; border-top: 1px solid #ddd; }
    .conf-num { font-size: 9px; color: #888; text-align: right; margin-bottom: 4px; }
  </style>
</head>
<body>
  <img class="watermark" src="/niyomlogo.png" alt="" />

  <div class="conf-num">Ref: ${deal.confirmation_number} &nbsp;&bull;&nbsp; ${fmtDate(deal.deal_date)}</div>

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <img src="/niyomlogo.png" alt="Niyom Wealth" />
      <div class="tagline">Wealth Reimagined</div>
    </div>
    <div class="deal-note-title">DEAL NOTE</div>
  </div>

  <!-- DEAL INFORMATION -->
  <div class="section-title">Deal Information</div>
  <table>
    <tr><td class="label-col">Deal Date</td><td class="val-col">${fmtDate(deal.deal_date)}</td></tr>
    <tr><td class="label-col">Transaction Type</td><td class="val-col">${deal.transaction_type}</td></tr>
    <tr><td class="label-col">Product Type</td><td class="val-col">${deal.product_type}</td></tr>
  </table>

  <!-- SECURITY DETAILS -->
  <div class="section-title">Security / Instrument Details</div>
  <table>
    <tr><td class="label-col">Security / Company Name</td><td class="val-col">${deal.security_name}</td></tr>
    <tr><td class="label-col">ISIN Number</td><td class="val-col">${deal.isin}</td></tr>
    <tr><td class="label-col">Quantity</td><td class="val-col">${numFmt(deal.quantity)}</td></tr>
    <tr><td class="label-col">Rate per Unit (₹)</td><td class="val-col">${numFmt(deal.rate_per_unit)} Per Share</td></tr>
    <tr><td class="label-col">Stamp Duty / Charges (₹)</td><td class="val-col">${(Math.round((deal.stamp_duty || 0) * 100) / 100).toFixed(2)}</td></tr>
    <tr><td class="label-col">Settlement Amount (₹)</td><td class="val-col"><strong>${settleFmt(deal.settlement_amount)}</strong></td></tr>
  </table>

  <!-- BUYER / SELLER -->
  <table class="split-table">
    <tr>
      <th colspan="2">Buyer Details</th>
      <th colspan="2">Seller Details</th>
    </tr>
    <tr>
      <th class="split-label">Particulars</th>
      <th class="split-val">Details</th>
      <th class="split-label">Particulars</th>
      <th class="split-val">Details</th>
    </tr>
    <tr>
      <td class="split-label">Client Name</td>
      <td class="split-val">${deal.snap_client_name}</td>
      <td class="split-label">Client Name</td>
      <td class="split-val">NIYOM WEALTH MANAGEMENT LLP</td>
    </tr>
    <tr>
      <td class="split-label">PAN Number</td>
      <td class="split-val">${deal.snap_pan}</td>
      <td class="split-label">PAN Number</td>
      <td class="split-val">AAZFN2255K</td>
    </tr>
    <tr>
      <td class="split-label">DP Name</td>
      <td class="split-val">${deal.snap_dp_name}</td>
      <td class="split-label">DP Name</td>
      <td class="split-val">Chola Securities</td>
    </tr>
    <tr>
      <td class="split-label">DP ID</td>
      <td class="split-val">${dpId}</td>
      <td class="split-label">DP ID</td>
      <td class="split-val">IN300572</td>
    </tr>
    <tr>
      <td class="split-label">Client ID</td>
      <td class="split-val">${clientIdDP}</td>
      <td class="split-label">Client ID</td>
      <td class="split-val">10158746</td>
    </tr>
    <tr>
      <td class="split-label">Depository</td>
      <td class="split-val">${deal.snap_depository || '-'}</td>
      <td class="split-label">Depository</td>
      <td class="split-val">NSDL</td>
    </tr>
  </table>

  <!-- PAYMENT DETAILS -->
  <div class="section-title">Payment Details</div>
  <table class="payment-table">
    <tr><th>Particulars</th><th>Details</th></tr>
    <tr><td class="label-col" style="text-align:center">Bank Name</td><td class="val-col">IDFC FIRST BANK</td></tr>
    <tr><td class="label-col" style="text-align:center">Account Name</td><td class="val-col">NIYOM WEALTH MANAGEMENT LLP</td></tr>
    <tr><td class="label-col" style="text-align:center">Account Number</td><td class="val-col">89394331135</td></tr>
    <tr><td class="label-col" style="text-align:center">IFSC Code</td><td class="val-col">IDFB0080131</td></tr>
    <tr><td class="label-col" style="text-align:center">Branch</td><td class="val-col">Anna Nagar West Branch</td></tr>
  </table>

  <!-- T&C -->
  <div class="tc-title">Terms &amp; Conditions</div>
  <div class="tc-item">
    <div class="tc-item-title">1. Deal Confirmation &amp; Settlement</div>
    <div class="tc-item-body">The transaction shall be considered final upon mutual confirmation of price, quantity, and settlement terms by both parties. The Buyer shall ensure timely payment, and the Seller shall ensure timely transfer of securities/bonds as per the agreed timeline.</div>
  </div>
  <div class="tc-item">
    <div class="tc-item-title">2. Intermediary Role</div>
    <div class="tc-item-body">Niyom Wealth Management LLP acts solely as a facilitator/intermediary for the transaction and shall not be held liable for any payment default, transfer delay, counterparty failure, operational issue, or investment-related loss.</div>
  </div>
  <div class="tc-item">
    <div class="tc-item-title">3. Risk &amp; Disclaimer</div>
    <div class="tc-item-body">Investments in unlisted shares and secondary bonds are subject to market, liquidity, credit, regulatory, and valuation risks. Niyom Wealth Management LLP does not guarantee listing, liquidity, returns, redemption, coupon payments, price appreciation, or exit opportunities. Clients are advised to undertake independent due diligence before transacting.</div>
  </div>
  <div class="tc-item">
    <div class="tc-item-title">4. Compliance, Taxes &amp; Charges</div>
    <div class="tc-item-body">All parties confirm compliance with applicable KYC norms, SEBI/RBI regulations, taxation laws, and depository requirements. Applicable taxes, stamp duty, DP charges, brokerage, and statutory levies shall be borne by the respective parties as mutually agreed.</div>
  </div>
  <div class="tc-item">
    <div class="tc-item-title">5. Jurisdiction &amp; Acceptance</div>
    <div class="tc-item-body">Any dispute, claim, default, or legal proceeding arising out of the transaction shall be subject to the exclusive jurisdiction of the courts in Chennai, Tamil Nadu, India. Execution of payment, transfer instruction, email/WhatsApp confirmation, or deal confirmation shall constitute deemed acceptance of these Terms &amp; Conditions.</div>
  </div>

  <!-- CONFIRMATION -->
  <div class="confirm-title"><strong>Confirmation</strong></div>
  <p style="font-size:9.5px;color:#333;margin-bottom:10px">We hereby confirm that the above details are true and agreed upon by both parties.</p>
  <table class="sign-table">
    <tr>
      <td style="padding:0">
        <div class="sign-title">For NIYOM WEALTH MANAGEMENT LLP</div>
        <div style="padding:12px 14px">
          <p style="font-size:9.5px">Authorized Signatory Name: <strong>N Ramya</strong></p>
          <p style="font-size:9.5px;margin-top:6px">Date: ${fmtDate(deal.deal_date)}</p>
          <img src="${window.location.origin}/Screenshot_2026-04-06_at_4.02.25_PM.png" style="height:56px;margin-top:4px;display:block" alt="Signature &amp; Seal" />
          <p style="font-size:9px;color:#888">Signature &amp; Seal</p>
        </div>
      </td>
      <td style="padding:0">
        <div class="sign-title">Client / Counterparty</div>
        <div style="padding:12px 14px">
          <p style="font-size:9.5px">Authorized Signatory Name: <strong>${deal.snap_client_name}</strong></p>
          <p style="font-size:9.5px;margin-top:6px">Date:</p>
          <br/><br/>
          <p style="font-size:9px;color:#888">Signature</p>
        </div>
      </td>
    </tr>
  </table>

  <div class="footer">Website: www.niyomwealth.com</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.document.title = `DEAL-CONFIRMATION-${clientCode}-${deal.deal_date}`;
    win.print();
  }, 500);
}

// ---------- Generate PDF as Base64 string for email attachment ----------
async function generateDealPDFBase64(deal: DealRecord): Promise<string> {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const PW = 210;
  const ML = 12, MR = 12, MT = 14;
  const CW = PW - ML - MR; // 186mm

  const numFmt = (n: number) =>
    (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dpId = deal.snap_demat_account ? deal.snap_demat_account.slice(0, 8) : '-';
  const clientIdDP = deal.snap_demat_account ? deal.snap_demat_account.slice(-8) : '-';

  // Helper: fetch image and return data URL
  async function fetchImgDataUrl(src: string): Promise<string | null> {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  // Helper: draw a 2-col label/value table (centered values)
  function draw2Col(
    rows: [string, string][],
    startY: number,
    cellH = 7,
    labelRatio = 0.4
  ): number {
    const lW = CW * labelRatio;
    const vW = CW * (1 - labelRatio);
    doc.setLineWidth(0.2);
    doc.setDrawColor(187, 187, 187);
    rows.forEach(([lbl, val], i) => {
      const ry = startY + i * cellH;
      // label cell
      doc.setFillColor(250, 250, 250);
      doc.rect(ML, ry, lW, cellH, 'FD');
      // value cell
      doc.setFillColor(255, 255, 255);
      doc.rect(ML + lW, ry, vW, cellH, 'FD');
      // label text
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(lbl, ML + lW / 2, ry + cellH / 2 + 1.4, { align: 'center' });
      // value text
      doc.setTextColor(17, 17, 17);
      const lines = doc.splitTextToSize(val, vW - 4);
      doc.text(lines[0] ?? val, ML + lW + vW / 2, ry + cellH / 2 + 1.4, { align: 'center' });
    });
    return startY + rows.length * cellH;
  }

  // Helper: section title, returns new Y
  function sectionTitle(text: string, sy: number): number {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text(text, ML, sy);
    return sy + 6;
  }

  // --- Load assets ---
  const [logoDataUrl, sigDataUrl] = await Promise.all([
    fetchImgDataUrl(window.location.origin + '/niyomlogo.png'),
    fetchImgDataUrl(window.location.origin + '/Screenshot_2026-04-06_at_4.02.25_PM.png'),
  ]);

  let y = MT;

  // ===== HEADER =====
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', ML, y, 28, 14);
  }

  // Tagline
  doc.setFontSize(11);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(139, 115, 85);
  doc.text('Wealth Reimagined', ML + 32, y + 10);

  // Deal Note title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text('DEAL NOTE', PW - MR, y + 6, { align: 'right' });

  y += 18;

  // Header divider
  doc.setDrawColor(17, 17, 17);
  doc.setLineWidth(0.5);
  doc.line(ML, y, PW - MR, y);
  y += 4;

  // Ref + date line
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(136, 136, 136);
  doc.text(
    `Ref: ${deal.confirmation_number}   |   ${fmtDate(deal.deal_date)}`,
    PW - MR, y, { align: 'right' }
  );
  y += 8;

  // ===== DEAL INFORMATION =====
  y = sectionTitle('Deal Information', y);
  y = draw2Col([
    ['Deal Date', fmtDate(deal.deal_date)],
    ['Transaction Type', deal.transaction_type],
    ['Product Type', deal.product_type],
  ], y);
  y += 5;

  // ===== SECURITY DETAILS =====
  y = sectionTitle('Security / Instrument Details', y);
  y = draw2Col([
    ['Security / Company Name', deal.security_name],
    ['ISIN Number', deal.isin],
    ['Quantity', numFmt(deal.quantity)],
    ['Rate per Unit (Rs.)', `${numFmt(deal.rate_per_unit)} Per Share`],
    ['Stamp Duty / Charges (Rs.)', (Math.round((deal.stamp_duty || 0) * 100) / 100).toFixed(2)],
    ['Settlement Amount (Rs.)', 'Rs. ' + numFmt(deal.settlement_amount)],
  ], y);
  y += 5;

  // ===== BUYER / SELLER SPLIT TABLE =====
  const colW = CW / 4;
  const splitRows: [string, string, string, string][] = [
    ['Client Name', deal.snap_client_name, 'Client Name', 'NIYOM WEALTH MANAGEMENT LLP'],
    ['PAN Number', deal.snap_pan, 'PAN Number', 'AAZFN2255K'],
    ['DP Name', deal.snap_dp_name, 'DP Name', 'Chola Securities'],
    ['DP ID', dpId, 'DP ID', 'IN300572'],
    ['Client ID', clientIdDP, 'Client ID', '10158746'],
    ['Depository', deal.snap_depository || '-', 'Depository', 'NSDL'],
  ];

  // Main header row
  doc.setLineWidth(0.2);
  doc.setDrawColor(187, 187, 187);
  const hH = 8;
  doc.setFillColor(240, 235, 224);
  doc.rect(ML, y, CW / 2, hH, 'FD');
  doc.rect(ML + CW / 2, y, CW / 2, hH, 'FD');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text('Buyer Details', ML + CW / 4, y + hH / 2 + 1.5, { align: 'center' });
  doc.text('Seller Details', ML + CW * 3 / 4, y + hH / 2 + 1.5, { align: 'center' });
  y += hH;

  // Sub-header row
  const shH = 6;
  doc.setFillColor(250, 247, 242);
  ['Particulars', 'Details', 'Particulars', 'Details'].forEach((h, ci) => {
    doc.rect(ML + ci * colW, y, colW, shH, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text(h, ML + ci * colW + colW / 2, y + shH / 2 + 1.5, { align: 'center' });
  });
  y += shH;

  // Data rows
  splitRows.forEach(([bl, bv, sl, sv]) => {
    const rH = 7;
    [bl, bv, sl, sv].forEach((txt, ci) => {
      const isLabel = ci === 0 || ci === 2;
      if (isLabel) {
        doc.setFillColor(250, 250, 247);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(ML + ci * colW, y, colW, rH, 'FD');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(isLabel ? 80 : 17, isLabel ? 80 : 17, isLabel ? 80 : 17);
      const lines = doc.splitTextToSize(txt, colW - 3);
      doc.text(lines[0] ?? txt, ML + ci * colW + colW / 2, y + rH / 2 + 1.5, { align: 'center' });
    });
    y += rH;
  });
  y += 5;

  // ===== PAYMENT DETAILS =====
  y = sectionTitle('Payment Details', y);
  const payW = CW * 0.55;
  const payX = ML + (CW - payW) / 2;
  const pLW = payW * 0.45;
  const pVW = payW * 0.55;

  // Payment header
  doc.setFillColor(240, 235, 224);
  doc.setLineWidth(0.2);
  doc.setDrawColor(187, 187, 187);
  doc.rect(payX, y, pLW, 7, 'FD');
  doc.rect(payX + pLW, y, pVW, 7, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text('Particulars', payX + pLW / 2, y + 5, { align: 'center' });
  doc.text('Details', payX + pLW + pVW / 2, y + 5, { align: 'center' });
  y += 7;

  const payRows: [string, string][] = [
    ['Bank Name', 'IDFC FIRST BANK'],
    ['Account Name', 'NIYOM WEALTH MANAGEMENT LLP'],
    ['Account Number', '89394331135'],
    ['IFSC Code', 'IDFB0080131'],
    ['Branch', 'Anna Nagar West Branch'],
  ];
  payRows.forEach(([k, v]) => {
    const rH = 7;
    doc.setFillColor(250, 250, 247);
    doc.rect(payX, y, pLW, rH, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.rect(payX + pLW, y, pVW, rH, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(k, payX + pLW / 2, y + rH / 2 + 1.5, { align: 'center' });
    doc.setTextColor(17, 17, 17);
    const lines = doc.splitTextToSize(v, pVW - 4);
    doc.text(lines[0] ?? v, payX + pLW + pVW / 2, y + rH / 2 + 1.5, { align: 'center' });
    y += rH;
  });
  y += 6;

  // ===== TERMS & CONDITIONS =====
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text('TERMS & CONDITIONS', ML, y);
  y += 7;

  const tcItems: [string, string][] = [
    ['1. Deal Confirmation & Settlement', 'The transaction shall be considered final upon mutual confirmation of price, quantity, and settlement terms by both parties. The Buyer shall ensure timely payment, and the Seller shall ensure timely transfer of securities/bonds as per the agreed timeline.'],
    ['2. Intermediary Role', 'Niyom Wealth Management LLP acts solely as a facilitator/intermediary for the transaction and shall not be held liable for any payment default, transfer delay, counterparty failure, operational issue, or investment-related loss.'],
    ['3. Risk & Disclaimer', 'Investments in unlisted shares and secondary bonds are subject to market, liquidity, credit, regulatory, and valuation risks. Niyom Wealth Management LLP does not guarantee listing, liquidity, returns, redemption, coupon payments, price appreciation, or exit opportunities. Clients are advised to undertake independent due diligence before transacting.'],
    ['4. Compliance, Taxes & Charges', 'All parties confirm compliance with applicable KYC norms, SEBI/RBI regulations, taxation laws, and depository requirements. Applicable taxes, stamp duty, DP charges, brokerage, and statutory levies shall be borne by the respective parties as mutually agreed.'],
    ['5. Jurisdiction & Acceptance', 'Any dispute, claim, default, or legal proceeding arising out of the transaction shall be subject to the exclusive jurisdiction of the courts in Chennai, Tamil Nadu, India. Execution of payment, transfer instruction, email/WhatsApp confirmation, or deal confirmation shall constitute deemed acceptance of these Terms & Conditions.'],
  ];

  tcItems.forEach(([title, body]) => {
    if (y > 260) { doc.addPage(); y = MT; }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text(title, ML, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 51, 51);
    const lines = doc.splitTextToSize(body, CW);
    doc.text(lines, ML, y);
    y += lines.length * 4.5 + 3;
  });

  // ===== CONFIRMATION =====
  if (y > 240) { doc.addPage(); y = MT; }
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text('Confirmation', ML, y);
  y += 5;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  doc.text('We hereby confirm that the above details are true and agreed upon by both parties.', ML, y);
  y += 8;

  const sigColW = CW / 2;
  const sigH = 32;

  // Signature header cells
  doc.setLineWidth(0.2);
  doc.setDrawColor(187, 187, 187);
  doc.setFillColor(240, 235, 224);
  doc.rect(ML, y, sigColW, 8, 'FD');
  doc.rect(ML + sigColW, y, sigColW, 8, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text('For NIYOM WEALTH MANAGEMENT LLP', ML + sigColW / 2, y + 5.5, { align: 'center' });
  doc.text('Client / Counterparty', ML + sigColW + sigColW / 2, y + 5.5, { align: 'center' });
  y += 8;

  // Signature body cells
  doc.setFillColor(255, 255, 255);
  doc.rect(ML, y, sigColW, sigH, 'FD');
  doc.rect(ML + sigColW, y, sigColW, sigH, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17, 17, 17);
  doc.text('Authorized Signatory Name: N Ramya', ML + 4, y + 7);
  doc.text(`Date: ${fmtDate(deal.deal_date)}`, ML + 4, y + 13);

  if (sigDataUrl) {
    doc.addImage(sigDataUrl, 'PNG', ML + 4, y + 16, 22, 11);
  }

  doc.setTextColor(136, 136, 136);
  doc.text('Signature & Seal', ML + 4, y + 29);

  doc.setTextColor(17, 17, 17);
  doc.text(`Authorized Signatory Name: ${deal.snap_client_name}`, ML + sigColW + 4, y + 7);
  doc.text('Date:', ML + sigColW + 4, y + 13);
  doc.setTextColor(136, 136, 136);
  doc.text('Signature', ML + sigColW + 4, y + 29);

  y += sigH + 8;

  // Footer
  doc.setDrawColor(221, 221, 221);
  doc.setLineWidth(0.2);
  doc.line(ML, y, PW - MR, y);
  y += 4;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(136, 136, 136);
  doc.text('Website: www.niyomwealth.com', PW / 2, y, { align: 'center' });

  // Return raw base64 (without data: prefix)
  return doc.output('datauristring').split(',')[1];
}

// ============================================================
export default function DealConfirmation({ employee }: Props) {
  const [view, setView] = useState<'list' | 'form' | 'preview'>('list');
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [clients, setClients] = useState<NWClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<DealForm>(emptyForm());
  const [selectedClient, setSelectedClient] = useState<NWClient | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [editDeal, setEditDeal] = useState<DealRecord | null>(null);
  const [previewDeal, setPreviewDeal] = useState<DealRecord | null>(null);
  const [deleteDeal, setDeleteDeal] = useState<DealRecord | null>(null);
  const [search, setSearch] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';
  const clientDropRef = useRef<HTMLDivElement>(null);

  const qty = parseFloat(form.quantity) || 0;
  const adjRate = parseFloat(form.rate_per_unit) || 0;
  const baseAmount = Math.round(qty * adjRate * 100) / 100;
  const stampDuty = Math.round(baseAmount * 0.015 / 100 * 100) / 100;
  const settlementAmount = Math.round((baseAmount + stampDuty) * 100) / 100;

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const loadDeals = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('nw_deal_confirmations')
      .select('*, client:nw_clients(full_name, client_code)')
      .order('created_at', { ascending: false });
    if (!isAdmin) q = q.eq('employee_id', employee.id);
    const { data } = await q;
    setDeals((data as DealRecord[]) || []);
    setLoading(false);
  }, [isAdmin, employee.id]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  useEffect(() => {
    let q = supabase
      .from('nw_clients')
      .select('id, client_code, full_name, pan, phone, email, dp_name, demat_account, depository, bank_name, bank_account, bank_ifsc, address, city, state, pincode, employee_id')
      .order('full_name');
    if (!isAdmin) q = (q as any).eq('employee_id', employee.id);
    q.then(({ data }) => setClients((data as unknown as NWClient[]) || []));
  }, [isAdmin, employee.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target as Node)) {
        setShowClientDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredClientOptions = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.client_code.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const openCreate = () => {
    setForm(emptyForm());
    setSelectedClient(null);
    setClientSearch('');
    setEditDeal(null);
    setError('');
    setView('form');
  };

  const openEdit = (deal: DealRecord) => {
    setEditDeal(deal);
    setForm({
      client_id: deal.client_id,
      deal_date: deal.deal_date,
      transaction_type: deal.transaction_type as 'Buy' | 'Sell',
      product_type: deal.product_type,
      security_name: deal.security_name,
      isin: deal.isin,
      quantity: String(deal.quantity),
      base_rate: String(deal.rate_per_unit),
      rate_per_unit: String(deal.rate_per_unit),
      notes: deal.notes,
    });
    const c = clients.find(c => c.id === deal.client_id);
    setSelectedClient(c || null);
    setClientSearch(c ? `${c.full_name} (${c.client_code})` : '');
    setError('');
    setView('form');
  };

  const selectClient = (c: NWClient) => {
    setSelectedClient(c);
    setForm(f => ({ ...f, client_id: c.id }));
    setClientSearch(`${c.full_name} (${c.client_code})`);
    setShowClientDrop(false);
  };

  const validate = (): boolean => {
    if (!form.client_id) { setError('Please select a client.'); return false; }
    if (!form.deal_date) { setError('Deal date is required.'); return false; }
    if (!form.transaction_type) { setError('Transaction type is required.'); return false; }
    if (!form.product_type.trim()) { setError('Product type is required.'); return false; }
    if (!form.security_name.trim()) { setError('Security / Company name is required.'); return false; }
    if (!form.isin.trim()) { setError('ISIN number is required.'); return false; }
    if (!form.quantity || isNaN(parseFloat(form.quantity)) || parseFloat(form.quantity) <= 0) { setError('Valid quantity is required.'); return false; }
    if (!form.base_rate || isNaN(parseFloat(form.base_rate)) || parseFloat(form.base_rate) <= 0) { setError('Valid rate per unit is required.'); return false; }
    setError('');
    return true;
  };

  const handleSave = async (status: 'draft' | 'confirmed') => {
    if (!validate()) return;
    if (!selectedClient) return;
    setSaving(true);

    const addr = [selectedClient.address, selectedClient.city, selectedClient.state].filter(Boolean).join(', ');

    const payload: Record<string, any> = {
      client_id: form.client_id,
      employee_id: employee.id,
      status,
      deal_date: form.deal_date,
      transaction_type: form.transaction_type,
      product_type: form.product_type,
      security_name: form.security_name.trim(),
      isin: form.isin.trim().toUpperCase(),
      quantity: parseFloat(form.quantity),
      base_rate: parseFloat(form.base_rate),
      rate_per_unit: parseFloat(form.rate_per_unit),
      snap_client_name: selectedClient.full_name,
      snap_pan: selectedClient.pan,
      snap_dp_name: selectedClient.dp_name,
      snap_demat_account: selectedClient.demat_account,
      snap_depository: (selectedClient as any).depository,
      snap_bank_name: selectedClient.bank_name,
      snap_bank_account: selectedClient.bank_account,
      snap_bank_ifsc: selectedClient.bank_ifsc,
      snap_address: addr,
      snap_phone: selectedClient.phone,
      snap_email: selectedClient.email,
      notes: form.notes,
    };

    if (editDeal) {
      const { error: err } = await supabase.from('nw_deal_confirmations').update(payload).eq('id', editDeal.id);
      setSaving(false);
      if (err) { setError(err.message); return; }
      showToast('Deal confirmation updated.');
    } else {
      const confNum = await supabase.rpc('nw_generate_confirmation_number', { p_employee_id: employee.id });
      payload.confirmation_number = confNum.data || `DC-${Date.now()}`;
      const { error: err } = await supabase.from('nw_deal_confirmations').insert([payload]);
      setSaving(false);
      if (err) { setError(err.message); return; }
      showToast(status === 'confirmed' ? 'Deal confirmation created.' : 'Draft saved.');
    }

    loadDeals();
    setView('list');
  };

  const handleDelete = async () => {
    if (!deleteDeal) return;
    await supabase.from('nw_deal_confirmations').delete().eq('id', deleteDeal.id);
    setDeleteDeal(null);
    loadDeals();
    showToast('Deleted.');
  };

  // ---------- Send Email ----------
  const handleSendEmail = async (deal: DealRecord) => {
    if (emailSending || deal.email_status === 'sent') return;
    setEmailSending(true);

    try {
      // 1. Generate PDF as base64
      const pdfBase64 = await generateDealPDFBase64(deal);

      // 2. Call Supabase Edge Function
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'send-deal-confirmation-email',
        {
          body: {
            dealId: deal.id,
            confirmationNumber: deal.confirmation_number,
            clientName: deal.snap_client_name,
            clientEmail: deal.snap_email,
            employeeName: employee.full_name,
            employeeDesignation: formatRole(employee.role),
            employeeEmail: employee.email,
            employeePhone: employee.phone,
            pdfBase64,
          },
        }
      );

      if (fnError || !fnData?.success) {
        throw new Error(fnData?.error || fnError?.message || 'Failed to send email');
      }

      // 3. Update database
      await supabase
        .from('nw_deal_confirmations')
        .update({
          email_status: 'sent',
          email_sent_at: new Date().toISOString(),
          email_sent_by: employee.id,
        })
        .eq('id', deal.id);

      // 4. Optimistically update previewDeal and reload list
      setPreviewDeal(prev =>
        prev && prev.id === deal.id
          ? { ...prev, email_status: 'sent', email_sent_at: new Date().toISOString() }
          : prev
      );
      await loadDeals();

      showToast('Deal Confirmation Email Sent Successfully');
    } catch (err: any) {
      showToast('Failed to Send Email', false);
    } finally {
      setEmailSending(false);
    }
  };

  const filteredDeals = deals.filter(d =>
    !search ||
    d.confirmation_number.toLowerCase().includes(search.toLowerCase()) ||
    d.snap_client_name.toLowerCase().includes(search.toLowerCase()) ||
    d.security_name.toLowerCase().includes(search.toLowerCase())
  );

  // ===================== PREVIEW ======================
  if (view === 'preview' && previewDeal) {
    const clientCode = (previewDeal.client as any)?.client_code || '';
    const dpId = previewDeal.snap_demat_account.slice(0, 8);
    const clientIdDP = previewDeal.snap_demat_account.slice(-8);
    const alreadySent = previewDeal.email_status === 'sent';

    const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
      <tr>
        <td className="px-4 py-2.5 text-xs font-medium" style={{ background: '#F7F5F0', borderRight: '1px solid #D5CDB8', color: '#444', width: '38%', textAlign: 'center' }}>{label}</td>
        <td className="px-4 py-2.5 text-xs text-center" style={{ color: bold ? '#111' : '#333', fontWeight: bold ? 700 : 400 }}>{value}</td>
      </tr>
    );

    return (
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm" style={{ color: '#8A8A8A' }}>
            <ChevronLeft className="w-4 h-4" /> Back to List
          </button>
          <div className="flex-1" />
          {/* Download PDF */}
          <button
            onClick={() => generatePDF(previewDeal, clientCode)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black"
            style={{ background: 'linear-gradient(135deg, #B8961E, #9C7D18)' }}
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
          {/* Send Email Button */}
          <button
            onClick={() => handleSendEmail(previewDeal)}
            disabled={emailSending || alreadySent}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black transition-all disabled:cursor-not-allowed"
            style={{
              background: alreadySent
                ? 'linear-gradient(135deg, #10B981, #059669)'
                : 'linear-gradient(135deg, #D4AF37, #B8961E)',
              opacity: emailSending ? 0.75 : 1,
            }}
          >
            {emailSending ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                Sending...
              </>
            ) : alreadySent ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Email Sent ✓
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Send Email
              </>
            )}
          </button>
        </div>

        {/* Preview Card */}
        <div className="rounded-2xl overflow-hidden bg-white shadow-2xl mx-auto" style={{ maxWidth: 780, border: '1px solid #D5CDB8' }}>
          {/* Header */}
          <div className="px-8 pt-8 pb-5 flex items-start justify-between" style={{ borderBottom: '2px solid #111' }}>
            <div className="flex items-center gap-5">
              <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-14 w-auto object-contain" />
              <span className="text-xl" style={{ fontFamily: 'Georgia, serif', color: '#8B7355', fontStyle: 'italic' }}>Wealth Reimagined</span>
            </div>
            <div className="text-right">
              <p className="text-xs mb-1" style={{ color: '#999' }}>{previewDeal.confirmation_number}</p>
              <p className="text-xl font-black tracking-widest">DEAL NOTE</p>
            </div>
          </div>

          <div className="px-8 py-6 space-y-6">
            {/* Deal Information */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: '#111' }}>Deal Information</p>
              <table className="w-full" style={{ border: '1px solid #D5CDB8', borderCollapse: 'collapse' }}>
                <tbody>
                  <Row label="Deal Date" value={fmtDate(previewDeal.deal_date)} />
                  <Row label="Transaction Type" value={previewDeal.transaction_type} />
                  <Row label="Product Type" value={previewDeal.product_type} />
                </tbody>
              </table>
            </div>

            {/* Security Details */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: '#111' }}>Security / Instrument Details</p>
              <table className="w-full" style={{ border: '1px solid #D5CDB8', borderCollapse: 'collapse' }}>
                <tbody>
                  <Row label="Security / Company Name" value={previewDeal.security_name} />
                  <Row label="ISIN Number" value={previewDeal.isin} />
                  <Row label="Quantity" value={previewDeal.quantity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                  <Row label="Rate per Unit (₹)" value={`₹${(Math.round(previewDeal.rate_per_unit * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Per Share`} />
                  <Row label="Stamp Duty / Charges (₹)" value={`₹${(Math.round((previewDeal.stamp_duty || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                  <Row label="Settlement Amount (₹)" value={fmt(previewDeal.settlement_amount)} bold />
                </tbody>
              </table>
            </div>

            {/* Buyer / Seller split table */}
            <div>
              <table className="w-full" style={{ border: '1px solid #D5CDB8', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th colSpan={2} className="py-2.5 text-xs font-black uppercase tracking-wider" style={{ background: '#F0EBE0', border: '1px solid #D5CDB8' }}>Buyer Details</th>
                    <th colSpan={2} className="py-2.5 text-xs font-black uppercase tracking-wider" style={{ background: '#F0EBE0', border: '1px solid #D5CDB8' }}>Seller Details</th>
                  </tr>
                  <tr>
                    {['Particulars', 'Details', 'Particulars', 'Details'].map((h, i) => (
                      <th key={i} className="py-2 text-xs font-semibold" style={{ background: '#FAF7F2', border: '1px solid #D5CDB8', width: '25%' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Client Name', previewDeal.snap_client_name, 'Client Name', 'NIYOM WEALTH MANAGEMENT LLP'],
                    ['PAN Number', previewDeal.snap_pan, 'PAN Number', 'AAZFN2255K'],
                    ['DP Name', previewDeal.snap_dp_name, 'DP Name', 'Chola Securities'],
                    ['DP ID', dpId, 'DP ID', 'IN300572'],
                    ['Client ID', clientIdDP, 'Client ID', '10158746'],
                    ['Depository', previewDeal.snap_depository || '-', 'Depository', 'NSDL'],
                  ].map(([bl, bv, sl, sv], i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs font-medium" style={{ background: '#FAFAF7', border: '1px solid #D5CDB8', textAlign: 'center' }}>{bl}</td>
                      <td className="px-3 py-2 text-xs text-center" style={{ border: '1px solid #D5CDB8' }}>{bv}</td>
                      <td className="px-3 py-2 text-xs font-medium" style={{ background: '#FAFAF7', border: '1px solid #D5CDB8', textAlign: 'center' }}>{sl}</td>
                      <td className="px-3 py-2 text-xs text-center" style={{ border: '1px solid #D5CDB8' }}>{sv}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Payment Details */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: '#111' }}>Payment Details</p>
              <div className="flex justify-center">
                <table style={{ width: '55%', border: '1px solid #D5CDB8', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-xs font-black" style={{ background: '#F0EBE0', border: '1px solid #D5CDB8' }}>Particulars</th>
                      <th className="px-4 py-2 text-xs font-black" style={{ background: '#F0EBE0', border: '1px solid #D5CDB8' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Bank Name', 'IDFC FIRST BANK'],
                      ['Account Name', 'NIYOM WEALTH MANAGEMENT LLP'],
                      ['Account Number', '89394331135'],
                      ['IFSC Code', 'IDFB0080131'],
                      ['Branch', 'Anna Nagar West Branch'],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td className="px-4 py-2 text-xs font-medium text-center" style={{ background: '#FAFAF7', border: '1px solid #D5CDB8' }}>{k}</td>
                        <td className="px-4 py-2 text-xs text-center" style={{ border: '1px solid #D5CDB8' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* T&C */}
            <div>
              <p className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: '#111' }}>Terms &amp; Conditions</p>
              {[
                ['1. Deal Confirmation & Settlement', 'The transaction shall be considered final upon mutual confirmation of price, quantity, and settlement terms by both parties. The Buyer shall ensure timely payment, and the Seller shall ensure timely transfer of securities/bonds as per the agreed timeline.'],
                ['2. Intermediary Role', 'Niyom Wealth Management LLP acts solely as a facilitator/intermediary for the transaction and shall not be held liable for any payment default, transfer delay, counterparty failure, operational issue, or investment-related loss.'],
                ['3. Risk & Disclaimer', 'Investments in unlisted shares and secondary bonds are subject to market, liquidity, credit, regulatory, and valuation risks. Niyom Wealth Management LLP does not guarantee listing, liquidity, returns, redemption, coupon payments, price appreciation, or exit opportunities. Clients are advised to undertake independent due diligence before transacting.'],
                ['4. Compliance, Taxes & Charges', 'All parties confirm compliance with applicable KYC norms, SEBI/RBI regulations, taxation laws, and depository requirements. Applicable taxes, stamp duty, DP charges, brokerage, and statutory levies shall be borne by the respective parties as mutually agreed.'],
                ['5. Jurisdiction & Acceptance', 'Any dispute, claim, default, or legal proceeding arising out of the transaction shall be subject to the exclusive jurisdiction of the courts in Chennai, Tamil Nadu, India. Execution of payment, transfer instruction, email/WhatsApp confirmation, or deal confirmation shall constitute deemed acceptance of these Terms & Conditions.'],
              ].map(([title, body]) => (
                <div key={title} className="mb-3">
                  <p className="text-xs font-bold mb-1" style={{ color: '#111' }}>{title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#555' }}>{body}</p>
                </div>
              ))}
            </div>

            {/* Confirmation */}
            <div>
              <p className="text-sm font-bold mb-2" style={{ color: '#111' }}>Confirmation</p>
              <p className="text-xs mb-4" style={{ color: '#555' }}>We hereby confirm that the above details are true and agreed upon by both parties.</p>
              <table className="w-full" style={{ border: '1px solid #D5CDB8', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #D5CDB8', width: '50%', padding: 0 }}>
                      <div className="px-3 py-2 text-xs font-black" style={{ background: '#F0EBE0', borderBottom: '1px solid #D5CDB8' }}>For NIYOM WEALTH MANAGEMENT LLP</div>
                      <div className="px-4 py-5 space-y-3">
                        <p className="text-xs">Authorized Signatory Name: <strong>N Ramya</strong></p>
                        <p className="text-xs">Date: {fmtDate(previewDeal.deal_date)}</p>
                        <img src="/Screenshot_2026-04-06_at_4.02.25_PM.png" alt="Signature &amp; Seal" className="h-14 mt-1" />
                        <p className="text-xs" style={{ color: '#888' }}>Signature &amp; Seal</p>
                      </div>
                    </td>
                    <td style={{ border: '1px solid #D5CDB8', width: '50%', padding: 0 }}>
                      <div className="px-3 py-2 text-xs font-black" style={{ background: '#F0EBE0', borderBottom: '1px solid #D5CDB8' }}>Client / Counterparty</div>
                      <div className="px-4 py-5 space-y-3">
                        <p className="text-xs">Authorized Signatory Name: <strong>{previewDeal.snap_client_name}</strong></p>
                        <p className="text-xs">Date:</p>
                        <div className="h-10" />
                        <p className="text-xs" style={{ color: '#888' }}>Signature</p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-center text-xs" style={{ color: '#999' }}>Website: www.niyomwealth.com</p>
          </div>
        </div>
      </div>
    );
  }

  // ===================== FORM ======================
  if (view === 'form') {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm" style={{ color: '#8A8A8A' }}>
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: '#D4AF37' }}>Deal Confirmation</p>
            <h1 className="text-xl font-bold text-white">{editDeal ? 'Edit Deal' : 'Create Deal Confirmation'}</h1>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Client Selection */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Step 1 — Select Client</p>
          <div ref={clientDropRef} className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8A8A8A' }}>
              Client Code / Name <span style={{ color: '#D4AF37' }}>*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
              <input
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setShowClientDrop(true); setSelectedClient(null); setForm(f => ({ ...f, client_id: '' })); }}
                onFocus={() => setShowClientDrop(true)}
                placeholder="Search by client name or code..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: '#050505', border: `1px solid ${selectedClient ? '#10B981' : '#1E1E24'}` }}
              />
              {selectedClient && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />}
            </div>
            {showClientDrop && filteredClientOptions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 rounded-xl overflow-hidden shadow-2xl" style={{ background: '#0D0D0D', border: '1px solid #1E1E24', maxHeight: 220, overflowY: 'auto' }}>
                {filteredClientOptions.slice(0, 30).map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="w-full text-left px-4 py-3 text-sm transition-colors"
                    style={{ color: '#fff', borderBottom: '1px solid #111' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,175,55,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span className="font-mono text-xs mr-2" style={{ color: '#D4AF37' }}>{c.client_code}</span>
                    {c.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Auto-filled client details */}
        {selectedClient && (
          <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Buyer Details (Auto-filled)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ROField label="Client Name" value={selectedClient.full_name} />
              <ROField label="PAN Number" value={selectedClient.pan} />
              <ROField label="Mobile Number" value={selectedClient.phone} />
              <ROField label="Email ID" value={selectedClient.email} />
              <ROField label="DP Name" value={selectedClient.dp_name} />
              <ROField label="Demat Account" value={selectedClient.demat_account} />
              <ROField label="DP ID (First 8 digits)" value={selectedClient.demat_account?.slice(0, 8) || '—'} />
              <ROField label="Client ID (Last 8 digits)" value={selectedClient.demat_account?.slice(-8) || '—'} />
              <ROField label="Bank Name" value={selectedClient.bank_name} />
              <ROField label="Bank Account" value={selectedClient.bank_account} />
              <ROField label="IFSC Code" value={selectedClient.bank_ifsc} />
            </div>
            <ROField label="Address" value={[selectedClient.address, selectedClient.city, selectedClient.state].filter(Boolean).join(', ')} />
          </div>
        )}

        {/* Deal Details */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Step 2 — Deal Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Deal Date" required>
              <Input type="date" value={form.deal_date} onChange={e => setForm(f => ({ ...f, deal_date: e.target.value }))} />
            </Field>
            <Field label="Transaction Type" required>
              <div className="relative">
                <select value={form.transaction_type} onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value as 'Buy' | 'Sell' }))}
                  className="w-full pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                  style={{ background: '#050505', border: '1px solid #1E1E24' }}>
                  <option value="">Select type</option>
                  <option value="Buy">Buy</option>
                  <option value="Sell">Sell</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#4A4A4A' }} />
              </div>
            </Field>
            <Field label="Product Type" required>
              <div className="relative">
                <select value={form.product_type} onChange={e => setForm(f => ({ ...f, product_type: e.target.value }))}
                  className="w-full pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                  style={{ background: '#050505', border: '1px solid #1E1E24' }}>
                  <option value="">Select product</option>
                  {PRODUCT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#4A4A4A' }} />
              </div>
            </Field>
          </div>
        </div>

        {/* Security Details */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Step 3 — Security / Instrument Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Security / Company Name" required>
              <Input value={form.security_name} onChange={e => setForm(f => ({ ...f, security_name: e.target.value }))} placeholder="e.g. Tata Motors Ltd" />
            </Field>
            <Field label="ISIN Number" required>
              <Input value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value.toUpperCase() }))} placeholder="INE001A01036" maxLength={12} />
            </Field>
            <Field label="Quantity" required>
              <Input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </Field>
            <Field label="Rate per Unit (₹)" required hint="Rate automatically adjusted after applicable charges deduction.">
              <Input
                type="number" min="0" step="0.01"
                value={form.base_rate}
                onChange={e => {
                  const adj = adjustRate(e.target.value);
                  setForm(f => ({ ...f, base_rate: e.target.value, rate_per_unit: adj }));
                }}
                placeholder="Enter base rate"
              />
              {form.rate_per_unit && (
                <p className="text-xs mt-1.5 font-semibold" style={{ color: '#D4AF37' }}>
                  Adjusted Rate: ₹{parseFloat(form.rate_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </Field>
          </div>

          {/* Auto-calculated values */}
          {(qty > 0 && adjRate > 0) && (
            <div className="rounded-xl p-4 grid grid-cols-2 gap-4 mt-2" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#4A4A4A' }}>Stamp Duty / Charges</p>
                <p className="text-lg font-black" style={{ color: '#D4AF37' }}>{fmt(stampDuty)}</p>
                <p className="text-xs mt-0.5" style={{ color: '#3A3A3A' }}>(Rate × Qty) × 0.015%</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#4A4A4A' }}>Settlement Amount</p>
                <p className="text-lg font-black" style={{ color: '#10B981' }}>{fmt(settlementAmount)}</p>
                <p className="text-xs mt-0.5" style={{ color: '#3A3A3A' }}>(Rate × Qty) + Stamp Duty</p>
              </div>
            </div>
          )}

          <Field label="Internal Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional internal notes..."
              className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none resize-none transition-all"
              style={{ background: '#050505', border: '1px solid #1E1E24' }} />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setView('list')} className="px-4 py-2.5 rounded-xl text-sm" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
            Cancel
          </button>
          <div className="flex-1" />
          <button onClick={() => handleSave('draft')} disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: '#111', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave('confirmed')} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
            <CheckCircle2 className="w-4 h-4" />
            {saving ? 'Saving...' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    );
  }

  // ===================== LIST ======================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#D4AF37' }}>Documents</p>
          <h1 className="text-2xl font-bold text-white">Deal Confirmations</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>Generate, preview and email deal confirmation notes</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
          <Plus className="w-4 h-4" /> Create Deal Confirmation
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold transition-all ${toast.ok ? 'text-emerald-400' : 'text-red-400'}`}
          style={{ background: '#0D0D0D', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: deals.length, color: '#D4AF37' },
          { label: 'Confirmed', value: deals.filter(d => d.status === 'confirmed').length, color: '#10B981' },
          { label: 'Drafts', value: deals.filter(d => d.status === 'draft').length, color: '#8A8A8A' },
          { label: 'Emails Sent', value: deals.filter(d => d.email_status === 'sent').length, color: '#60a5fa' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4A4A4A' }}>{s.label}</p>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by reference, client or security..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
          style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }} />
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#2A2A2A' }} />
            <p className="text-sm font-semibold" style={{ color: '#4A4A4A' }}>No deal confirmations yet</p>
            <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>Click "Create Deal Confirmation" to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                  {['Reference', 'Client', 'Security', 'Type', 'Date', 'Settlement', 'Status', 'Email', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A4A4A' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono font-bold" style={{ color: '#D4AF37' }}>{d.confirmation_number}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-white">{d.snap_client_name}</p>
                      <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{(d.client as any)?.client_code}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-white">{d.security_name}</p>
                      <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{d.isin}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${d.transaction_type === 'Buy' ? 'text-emerald-400 bg-emerald-900/20' : 'text-red-400 bg-red-900/20'}`}>
                        {d.transaction_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: '#8A8A8A' }}>{fmtDate(d.deal_date)}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-bold text-white">{fmt(d.settlement_amount || 0)}</p>
                      <p className="text-xs" style={{ color: '#4A4A4A' }}>Qty: {d.quantity?.toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${d.status === 'confirmed' ? 'text-emerald-400 bg-emerald-900/20' : 'text-amber-400 bg-amber-900/20'}`}>
                        {d.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                      </span>
                    </td>
                    {/* Email Status — replaces Download PDF */}
                    <td className="px-5 py-3.5">
                      <EmailStatusBadge status={d.email_status ?? 'pending'} />
                    </td>
                    {/* Actions: Preview | Edit | Delete */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setPreviewDeal(d); setView('preview'); }}
                          className="p-1.5 rounded-lg transition-colors" title="Preview"
                          style={{ color: '#4A4A4A' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(d)}
                          className="p-1.5 rounded-lg transition-colors" title="Edit"
                          style={{ color: '#4A4A4A' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteDeal(d)}
                          className="p-1.5 rounded-lg transition-colors" title="Delete"
                          style={{ color: '#4A4A4A' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Delete Deal Confirmation</p>
                <p className="text-xs" style={{ color: '#6B6B6B' }}>{deleteDeal.confirmation_number}</p>
              </div>
            </div>
            <p className="text-sm" style={{ color: '#8A8A8A' }}>This action is permanent and cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteDeal(null)} className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#ef4444' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
