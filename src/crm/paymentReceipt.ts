import html2pdf from 'html2pdf.js';
import { NIYOM_COMPANY, amountInWords } from './dsaDebitNote';

// ---------------------------------------------------------------------------
// Payment Receipt PDF — same production-grade shape as the DSA Debit Note.
// Rendered client-side with html2pdf.js and returned as base64 for upload
// via the upload-receipt edge function.
// ---------------------------------------------------------------------------

const NIYOM_LOGO = '/niyomlogo.png';
const NIYOM_SIGNATURE = '/Screenshot_2026-04-06_at_4.02.25_PM.png';

// ARN details are the single source of truth in RegulatoryInfo.tsx; mirrored
// here so the receipt can be regenerated without a React render.
const ARN = 'ARN-362707';
const ARN_VALID_TILL = '11-JUN-2029';

const MODE_LABEL: Record<string, string> = {
  imps: 'IMPS',
  neft: 'NEFT',
  rtgs: 'RTGS',
  upi: 'UPI',
  cheque: 'Cheque',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  online_gateway: 'Online Gateway',
  demand_draft: 'Demand Draft',
  internal_adjustment: 'Internal Adjustment',
};

const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface ReceiptDealContext {
  confirmation_number: string;
  snap_client_name:    string;
  snap_pan:            string;
  deal_date:           string;
  security_name:       string;
  isin:                string;
  quantity:            number;
  rate_per_unit:       number;
  settlement_amount:   number;
}

export interface ReceiptPaymentContext {
  payment_number:      string;
  receipt_number:      string;   // preview or existing
  amount_inr:          number;
  payment_mode:        string;
  utr_number?:         string | null;
  cheque_number?:      string | null;
  cheque_bank?:        string | null;
  transaction_reference?: string | null;
  demand_draft_number?:   string | null;
  payment_date:        string;
  value_date?:         string | null;
  received_from_name?: string | null;
  received_from_bank?: string | null;
  remarks?:            string | null;
}

export interface ReceiptSummaryContext {
  total_paid_amount:   number;
  outstanding_amount:  number;
  payment_status:      'not_paid' | 'partially_paid' | 'fully_paid' | 'over_paid';
}

export interface ReceiptRenderInput {
  deal:    ReceiptDealContext;
  payment: ReceiptPaymentContext;
  summary: ReceiptSummaryContext;
  generatedByName: string;
  generatedByRole: string;
  issuedAt: Date;
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function statusPill(status: ReceiptSummaryContext['payment_status']): string {
  const map: Record<string, { text: string; bg: string; fg: string }> = {
    not_paid:       { text: 'NOT PAID',       bg: '#f3f3f3', fg: '#666' },
    partially_paid: { text: 'PARTIALLY PAID', bg: '#FFF9EC', fg: '#B8961E' },
    fully_paid:     { text: 'FULLY PAID',     bg: '#EDFBF2', fg: '#0A7B3B' },
    over_paid:      { text: 'OVER PAID',      bg: '#FDECEC', fg: '#B42222' },
  };
  const s = map[status];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:9px;font-weight:700;
    background:${s.bg};color:${s.fg};letter-spacing:0.5px;">${s.text}</span>`;
}

function referenceCell(p: ReceiptPaymentContext): string {
  if (p.utr_number)          return `UTR: ${p.utr_number}`;
  if (p.cheque_number)       return `Cheque: ${p.cheque_number}${p.cheque_bank ? ` (${p.cheque_bank})` : ''}`;
  if (p.demand_draft_number) return `DD: ${p.demand_draft_number}`;
  if (p.transaction_reference) return `Txn Ref: ${p.transaction_reference}`;
  return '—';
}

function buildHtml(input: ReceiptRenderInput): string {
  const { deal, payment, summary, generatedByName, generatedByRole, issuedAt } = input;

  const modeLabel = MODE_LABEL[payment.payment_mode] ?? payment.payment_mode;

  return `
<div id="payment-receipt-pdf" style="
  font-family: Arial, Helvetica, sans-serif;
  color:#222; background:#ffffff;
  width:794px; padding:36px 40px; box-sizing:border-box;
  font-size:11px; line-height:1.55;">

  <!-- ================== HEADER ================== -->
  <div style="display:flex; align-items:flex-start; justify-content:space-between;
       border-bottom:2px solid #D4AF37; padding-bottom:16px; margin-bottom:20px;">
    <div style="display:flex; align-items:center; gap:14px;">
      <img src="${NIYOM_LOGO}" alt="Niyom Wealth" style="height:56px; width:auto;" />
      <div>
        <div style="font-size:18px; font-weight:700; color:#111; letter-spacing:0.5px;">
          ${NIYOM_COMPANY.name}
        </div>
        <div style="font-size:10px; color:#666; margin-top:2px;">
          ${NIYOM_COMPANY.address}
        </div>
        <div style="font-size:10px; color:#666;">
          ${NIYOM_COMPANY.email} &nbsp;·&nbsp; ${ARN} &nbsp;·&nbsp; Valid till ${ARN_VALID_TILL}
        </div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px; font-weight:800; color:#111; letter-spacing:1px;">PAYMENT RECEIPT</div>
      <div style="font-size:11px; margin-top:6px;">
        <span style="color:#666;">Receipt No.:</span>
        <strong style="color:#111;">${payment.receipt_number}</strong>
      </div>
      <div style="font-size:11px;">
        <span style="color:#666;">Issued On:</span>
        <strong style="color:#111;">${fmtDate(issuedAt.toISOString())}</strong>
      </div>
    </div>
  </div>

  <!-- ================== CLIENT + DEAL ================== -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
    <tr>
      <td style="width:50%; vertical-align:top; padding-right:12px;">
        <div style="font-size:9px; font-weight:700; color:#8B7355; text-transform:uppercase;
             letter-spacing:1px; margin-bottom:6px;">Received From</div>
        <div style="border:1px solid #eee; border-radius:6px; padding:10px 12px;">
          <div style="font-weight:700; color:#111; margin-bottom:4px;">${deal.snap_client_name || '—'}</div>
          <div style="color:#555;">PAN: ${deal.snap_pan || '—'}</div>
          ${payment.received_from_name && payment.received_from_name !== deal.snap_client_name
            ? `<div style="color:#555; margin-top:4px; font-size:10px;">
                 Paid by: ${payment.received_from_name}${payment.received_from_bank ? ` · ${payment.received_from_bank}` : ''}
               </div>`
            : ''}
        </div>
      </td>
      <td style="width:50%; vertical-align:top; padding-left:12px;">
        <div style="font-size:9px; font-weight:700; color:#8B7355; text-transform:uppercase;
             letter-spacing:1px; margin-bottom:6px;">Against Deal</div>
        <div style="border:1px solid #eee; border-radius:6px; padding:10px 12px;">
          <div style="font-weight:700; color:#111; margin-bottom:4px;">${deal.confirmation_number}</div>
          <div style="color:#555;">Deal Date: ${fmtDate(deal.deal_date)}</div>
          <div style="color:#555; font-size:10px; margin-top:4px;">
            ${deal.security_name}${deal.isin ? ` · ISIN ${deal.isin}` : ''}
          </div>
        </div>
      </td>
    </tr>
  </table>

  <!-- ================== PAYMENT DETAILS ================== -->
  <div style="font-size:9px; font-weight:700; color:#8B7355; text-transform:uppercase;
       letter-spacing:1px; margin-bottom:6px;">Payment Details</div>
  <table style="width:100%; border-collapse:collapse; border:1px solid #eee; border-radius:6px; margin-bottom:14px;">
    <tbody>
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#666; width:35%;">Payment No.</td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; font-weight:600; color:#111;">${payment.payment_number}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#666;">Mode</td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#111;">${modeLabel}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#666;">Reference</td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#111; font-family:Menlo,monospace;">${referenceCell(payment)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#666;">Payment Date</td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#111;">${fmtDate(payment.payment_date)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px; color:#666;">Value Date (Credit Realised)</td>
        <td style="padding:8px 12px; color:#111;">${payment.value_date ? fmtDate(payment.value_date) : '—'}</td>
      </tr>
    </tbody>
  </table>

  <!-- ================== AMOUNT PANEL ================== -->
  <div style="background:#FFF9EC; border:1px solid #D4AF37; border-radius:8px; padding:14px 18px; margin-bottom:16px;">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <div>
        <div style="font-size:9px; font-weight:700; color:#8B7355; text-transform:uppercase; letter-spacing:1px;">
          Amount Received
        </div>
        <div style="font-size:22px; font-weight:800; color:#111; margin-top:2px;">
          ${inr(payment.amount_inr)}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px; color:#8B7355; text-transform:uppercase; letter-spacing:1px;">Status</div>
        <div style="margin-top:4px;">${statusPill(summary.payment_status)}</div>
      </div>
    </div>
    <div style="font-size:10px; color:#666; font-style:italic; margin-top:8px;">
      Amount in Words: <span style="color:#111;">${amountInWords(payment.amount_inr)}</span>
    </div>
  </div>

  <!-- ================== BALANCE SUMMARY ================== -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
    <tr>
      <td style="width:33%; padding:10px; border:1px solid #eee; border-radius:6px; text-align:center;">
        <div style="font-size:9px; color:#8B7355; text-transform:uppercase; letter-spacing:1px;">Deal Amount</div>
        <div style="font-size:14px; font-weight:700; color:#111; margin-top:4px;">${inr(deal.settlement_amount)}</div>
      </td>
      <td style="width:33%; padding:10px; border:1px solid #eee; text-align:center;">
        <div style="font-size:9px; color:#8B7355; text-transform:uppercase; letter-spacing:1px;">Total Paid to Date</div>
        <div style="font-size:14px; font-weight:700; color:#0A7B3B; margin-top:4px;">${inr(summary.total_paid_amount)}</div>
      </td>
      <td style="width:33%; padding:10px; border:1px solid #eee; text-align:center;">
        <div style="font-size:9px; color:#8B7355; text-transform:uppercase; letter-spacing:1px;">Outstanding</div>
        <div style="font-size:14px; font-weight:700; color:${summary.outstanding_amount > 0 ? '#B8961E' : summary.outstanding_amount < 0 ? '#B42222' : '#0A7B3B'}; margin-top:4px;">
          ${inr(Math.abs(summary.outstanding_amount))}
        </div>
      </td>
    </tr>
  </table>

  <!-- ================== DECLARATION ================== -->
  <div style="font-size:10px; color:#555; margin-bottom:16px; padding:10px 12px;
       background:#fafafa; border-left:3px solid #D4AF37; border-radius:4px;">
    ${payment.payment_mode === 'cheque' || payment.payment_mode === 'demand_draft'
      ? 'This receipt is issued subject to realisation of the instrument by the collecting bank.'
      : 'This receipt acknowledges credit of the above amount to Niyom Wealth Distribution LLP in respect of the deal referenced above.'}
    ${payment.remarks ? `<div style="margin-top:6px;"><strong>Remarks:</strong> ${payment.remarks}</div>` : ''}
  </div>

  <!-- ================== SIGNATURE BLOCK ================== -->
  <table style="width:100%; border-collapse:collapse; margin-top:24px;">
    <tr>
      <td style="width:50%; vertical-align:bottom; padding-top:24px;">
        <div style="border-top:1px solid #333; padding-top:6px; font-size:10px; color:#666;">
          Received by Client / Authorised Signatory
        </div>
      </td>
      <td style="width:50%; vertical-align:bottom; text-align:right; padding-top:24px;">
        <img src="${NIYOM_SIGNATURE}" alt="Authorised Signature"
             style="height:44px; width:auto; margin-bottom:6px; margin-right:8px;" />
        <div style="border-top:1px solid #333; padding-top:6px; font-size:10px; color:#666;">
          For ${NIYOM_COMPANY.name}<br/>
          <strong style="color:#111;">${generatedByName}</strong> · ${generatedByRole}
        </div>
      </td>
    </tr>
  </table>

  <!-- ================== FOOTER ================== -->
  <div style="margin-top:28px; padding-top:12px; border-top:1px solid #eee;
       font-size:9px; color:#888; line-height:1.6;">
    <div><strong>Niyom Wealth Distribution LLP</strong> · AMFI Registered Mutual Fund Distributor · ${ARN} (Valid till ${ARN_VALID_TILL})</div>
    <div>${NIYOM_COMPANY.address}</div>
    <div style="margin-top:4px;">
      Mutual fund investments are subject to market risks. Please read all scheme-related documents carefully before investing.
    </div>
    <div style="margin-top:4px;">This receipt is intended for the named recipient only. Ref: ${payment.receipt_number}</div>
  </div>
</div>
`;
}

// ---------------------------------------------------------------------------
// Render → base64 PDF
// ---------------------------------------------------------------------------

export async function renderPaymentReceiptPdf(input: ReceiptRenderInput): Promise<string> {
  const html = buildHtml(input);

  // Stage the HTML in an off-screen container so html2canvas has real
  // layout to measure. Detached DOM does not work reliably for html2pdf.
  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-10000px';
  wrap.style.top = '0';
  wrap.style.width = '794px';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  try {
    const opts = {
      margin: 0,
      filename: `${input.payment.receipt_number}.pdf`,
      image: { type: 'png' as const, quality: 1 },
      html2canvas: { scale: 3, useCORS: true, logging: false, windowWidth: 794, letterRendering: true },
      jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] as string[] },
    };

    const pdfBlob: Blob = await html2pdf().set(opts).from(wrap.firstElementChild as HTMLElement).outputPdf('blob');

    // Blob → base64 (strip data-URI prefix so Resend / storage accept it later)
    const buf = await pdfBlob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    // Chunk to avoid stack overflow on large arrays
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return btoa(bin);
  } finally {
    document.body.removeChild(wrap);
  }
}

// ---------------------------------------------------------------------------
// Direct browser download (no upload) — used only if we ever want a pure
// client-side download path; upload path uses renderPaymentReceiptPdf + the
// upload-receipt edge function.
// ---------------------------------------------------------------------------
export async function downloadPaymentReceiptPdf(input: ReceiptRenderInput): Promise<void> {
  const html = buildHtml(input);
  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-10000px';
  wrap.style.top = '0';
  wrap.style.width = '794px';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  try {
    await html2pdf().set({
      margin: 0,
      filename: `${input.payment.receipt_number}.pdf`,
      image: { type: 'png' as const, quality: 1 },
      html2canvas: { scale: 3, useCORS: true, logging: false, windowWidth: 794, letterRendering: true },
      jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const },
    }).from(wrap.firstElementChild as HTMLElement).save();
  } finally {
    document.body.removeChild(wrap);
  }
}
