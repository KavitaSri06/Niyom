// Bond Creation module — client-facing marketing brochure generator.
//
// Produces a premium, NIYOM-branded A4 sheet suitable for direct sharing with
// clients. Dark-blue / white / gold palette. The headline is a precise, rupee
// INVESTMENT SUMMARY (total payable + indicative annual income) computed from a
// unit quantity — not a bare "per ₹100" price. Default output is a PNG image
// (ideal for WhatsApp/email sharing); a PDF variant shares the same layout.
//
// CONFIDENTIALITY: this renderer only ever receives the employee-safe catalog
// shape plus a computed selling price. It NEVER references landing_cost, internal
// margin, internal notes, or admin remarks — those fields are not in its input.

import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import { NWBondCatalog } from './bondTypes';
import { NIYOM_BRAND, BOND_PDF_DISCLAIMER } from './bondConstants';
import { formatPercent, formatDate, formatINRFull, formatINR, computeBondInvestment, inferFrequency } from './bondUtils';
import { EmployeeContact } from './cashflowPdf';

const NIYOM_LOGO = '/niyomlogo.png';

const NIYOM = {
  name: 'NIYOM WEALTH DISTRIBUTION LLP',
  tagline: 'Wealth Distribution & Advisory',
  address: 'No 126, 1st Floor, Poonamalle High Road, Varalakshmi Nagar, Maduravoyal, Chennai – 600 095',
  email: 'support@niyomwealth.com',
  web: 'www.niyomwealth.com',
};

export interface MarketingPdfOptions {
  sellingPrice: number | null;   // client-facing price per ₹100 (already computed; NO cost)
  quantity?: number | null;      // whole units, drives the precise investment figures
  accruedInterest?: number | null;   // added to the clean investment for the exact payable
  investmentAmount?: number | null;  // exact payable (principal + accrued); overrides the clean calc
  yieldAtPrice?: number | null;      // YTM re-solved at this price (falls back to sheet YTM)
  contact?: EmployeeContact;
  generatedByName?: string;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function safe(v: unknown): string {
  const s = String(v ?? '').trim();
  return s && s.toUpperCase() !== 'NA' ? esc(s) : '';
}

// A compact stat chip for the dark highlights strip.
function chip(label: string, value: string): string {
  const { goldSoft, white } = NIYOM_BRAND;
  return `
    <div style="flex:1;min-width:104px;padding:2px 4px;">
      <div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:${goldSoft};font-weight:700;">${label}</div>
      <div style="font-size:16px;font-weight:800;margin-top:4px;color:${white};line-height:1.1;">${value || '—'}</div>
    </div>`;
}

// A key/value detail row (only rendered when a value exists).
function row(label: string, value: string): string {
  if (!value) return '';
  const { ink, line } = NIYOM_BRAND;
  return `
    <div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid ${line};">
      <span style="font-size:10.5px;color:#5a6b85;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">${label}</span>
      <span style="font-size:11.5px;color:${ink};font-weight:600;text-align:right;max-width:58%;">${value}</span>
    </div>`;
}

function buildHtml(bond: NWBondCatalog, opts: MarketingPdfOptions): string {
  const { darkBlue, navy, gold, goldSoft, white, ink, mist, line } = NIYOM_BRAND;
  const title = safe(bond.bond_name) || safe(bond.company_name) || 'Bond Investment Opportunity';
  const per100 = opts.sellingPrice ?? bond.selling_price ?? null;

  const inv = computeBondInvestment({
    faceValue: bond.face_value, sellingPricePer100: per100, coupon: bond.coupon, quantity: opts.quantity ?? null,
  });

  const couponStr = bond.coupon !== null ? formatPercent(bond.coupon) : (safe(bond.coupon_text) || '—');
  const ytmStr = formatPercent(opts.yieldAtPrice ?? bond.yield_ytm);
  const maturityStr = bond.maturity_date ? formatDate(bond.maturity_date) : (safe(bond.maturity_text).split('(')[0].trim() || '—');
  const payoutStr = inferFrequency(bond.interest_frequency, bond.interest_payment_dates) || '—';

  // Headline investment figures (precise ₹). The exact payable includes accrued
  // interest when supplied; otherwise falls back to the clean amount.
  const exactInvestment = opts.investmentAmount ?? inv.investmentAmount;
  const investAmount = exactInvestment !== null && exactInvestment !== undefined ? formatINRFull(exactInvestment)
    : (per100 !== null ? `${formatINRFull(per100)} / ₹100` : 'On Request');
  const annualIncome = inv.annualIncome !== null ? formatINRFull(inv.annualIncome) : '—';
  const qtyStr = opts.quantity ? `${opts.quantity.toLocaleString('en-IN')} unit${opts.quantity === 1 ? '' : 's'}` : '—';
  const notionalStr = inv.faceValueAmount !== null ? formatINR(inv.faceValueAmount) : (safe(bond.face_value_text) || '—');

  const highlights = [
    chip('Coupon', couponStr),
    chip('Yield (YTM)', ytmStr),
    chip('Maturity', maturityStr),
    chip('Rating', safe(bond.rating) || '—'),
    chip('Payout', payoutStr),
  ].join('<div style="width:1px;background:rgba(200,162,75,0.3);align-self:stretch;"></div>');

  const overview = [
    row('Issuer', safe(bond.issuer) || safe(bond.company_name)),
    row('ISIN', safe(bond.isin)),
    row('Security Type', safe(bond.security_type)),
    row('Category', safe(bond.security_category)),
    row('Seniority', safe(bond.seniority)),
    row('Face Value / Unit', safe(bond.face_value_text)),
    row('Min. Investment', safe(bond.minimum_investment) || safe(bond.multiples)),
    row('Listing', safe(bond.listing_exchange)),
    row('Tax Status', safe(bond.tax_status)),
  ].join('');

  const structure = [
    row('Interest Payment', safe(bond.interest_payment_dates)),
    row('Maturity / Redemption', safe(bond.maturity_text)),
    row('Tenure', safe(bond.tenure)),
    row('Put Option', safe(bond.put_option)),
    row('Call Option', safe(bond.call_option)),
    row('Principal Repayment', safe(bond.principal_repayment)),
    row('Credit Enhancement', safe(bond.credit_enhancement)),
    row('Trustee', safe(bond.trustee)),
    row('Rating Agency', safe(bond.rating_agency)),
  ].join('');

  const extraNotes = [safe(bond.notes), safe(bond.footnotes), safe(bond.remarks)].filter(Boolean).join(' • ');
  const bondDisclaimer = safe(bond.disclaimers);

  // The gold "Investment Summary" — the piece a client reads first.
  const summaryCell = (label: string, value: string, sub = '') => `
    <div style="flex:1;min-width:130px;">
      <div style="font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:${goldSoft};font-weight:700;">${label}</div>
      <div style="font-size:22px;font-weight:900;margin-top:3px;color:${white};line-height:1.05;">${value}</div>
      ${sub ? `<div style="font-size:9.5px;color:#b9c6de;margin-top:3px;">${sub}</div>` : ''}
    </div>`;

  return `
  <div style="width:794px;box-sizing:border-box;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:${white};color:${ink};">
    <!-- Cover band -->
    <div style="background:linear-gradient(135deg,${darkBlue} 0%,${navy} 100%);padding:30px 42px 24px;color:${white};position:relative;overflow:hidden;">
      <div style="position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(200,162,75,0.22),transparent 70%);"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;position:relative;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${NIYOM_LOGO}" alt="Niyom Wealth" style="height:46px;width:auto;object-fit:contain;" />
          <div>
            <div style="font-size:17px;font-weight:800;letter-spacing:0.02em;">NIYOM WEALTH</div>
            <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:${goldSoft};">${NIYOM.tagline}</div>
          </div>
        </div>
        <div style="text-align:center;background:rgba(200,162,75,0.14);border:1px solid ${gold};border-radius:14px;padding:8px 16px;">
          <div style="font-size:8.5px;letter-spacing:0.14em;text-transform:uppercase;color:${goldSoft};font-weight:700;">Coupon</div>
          <div style="font-size:26px;font-weight:900;color:${white};line-height:1;">${couponStr}</div>
          <div style="font-size:8.5px;color:${goldSoft};margin-top:2px;">${ytmStr} YTM</div>
        </div>
      </div>

      <div style="margin-top:22px;position:relative;">
        <div style="width:46px;height:3px;background:${gold};border-radius:2px;"></div>
        <h1 style="font-size:23px;font-weight:800;margin:12px 0 0;line-height:1.2;letter-spacing:0.01em;">${title}</h1>
        <div style="margin-top:9px;display:flex;gap:8px;flex-wrap:wrap;">
          ${safe(bond.security_category) ? `<span style="display:inline-block;background:rgba(200,162,75,0.18);border:1px solid ${gold};color:${goldSoft};font-size:9.5px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${safe(bond.security_category)}</span>` : ''}
          ${safe(bond.security_type) ? `<span style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:#d7e0f0;font-size:9.5px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${safe(bond.security_type)}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Highlights strip -->
    <div style="background:${navy};padding:14px 42px;display:flex;gap:0;align-items:center;border-top:1px solid rgba(200,162,75,0.25);">
      ${highlights}
    </div>

    <!-- Investment summary (the headline) -->
    <div style="margin:20px 42px 0;background:linear-gradient(135deg,${darkBlue},${navy});border:1px solid ${gold};border-radius:16px;padding:20px 24px;box-shadow:0 10px 24px rgba(11,31,58,0.18);">
      <div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${gold};font-weight:800;margin-bottom:14px;">Investment Summary</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;">
        ${summaryCell('Total Investment', investAmount,
          [qtyStr !== '—' ? `${qtyStr} · Face ${notionalStr}` : '',
           opts.accruedInterest ? `incl. ${formatINRFull(opts.accruedInterest)} accrued interest` : '']
            .filter(Boolean).join('<br/>'))}
        <div style="width:1px;background:rgba(200,162,75,0.3);"></div>
        ${summaryCell('Indicative Annual Income', annualIncome, bond.coupon !== null ? `at ${couponStr} coupon` : '')}
        <div style="width:1px;background:rgba(200,162,75,0.3);"></div>
        ${summaryCell('Yield to Maturity', ytmStr, maturityStr !== '—' ? `matures ${maturityStr}` : '')}
      </div>
    </div>

    <!-- Body: two-column detail -->
    <div style="padding:22px 42px 8px;">
      <div style="display:flex;gap:30px;">
        <div style="flex:1;">
          <div style="font-size:11.5px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:0.1em;border-bottom:2px solid ${gold};padding-bottom:6px;margin-bottom:4px;">Bond Overview</div>
          ${overview}
        </div>
        <div style="flex:1;">
          <div style="font-size:11.5px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:0.1em;border-bottom:2px solid ${gold};padding-bottom:6px;margin-bottom:4px;">Interest &amp; Redemption</div>
          ${structure}
        </div>
      </div>
    </div>

    <!-- Pricing footnote (precise, small) -->
    <div style="margin:10px 42px 0;background:${mist};border:1px solid ${line};border-left:4px solid ${gold};border-radius:12px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <div style="font-size:10.5px;color:#5a6b85;font-weight:600;">Price <strong style="color:${navy};">${per100 !== null ? formatINRFull(per100) : 'On Request'}</strong> per ₹100 face value${inv.pricePerUnit !== null ? ` &nbsp;•&nbsp; <strong style="color:${navy};">${formatINRFull(inv.pricePerUnit)}</strong> per unit` : ''}</div>
      <div style="font-size:9.5px;color:#8592a8;">Indicative &amp; subject to confirmation on the transaction date.</div>
    </div>

    ${extraNotes || bondDisclaimer ? `
    <div style="margin:12px 42px 0;">
      ${extraNotes ? `<div style="font-size:10.5px;color:${ink};line-height:1.6;"><strong style="color:${navy};">Notes:</strong> ${extraNotes}</div>` : ''}
      ${bondDisclaimer ? `<div style="font-size:10.5px;color:${ink};line-height:1.6;margin-top:5px;"><strong style="color:${navy};">Disclaimer:</strong> ${bondDisclaimer}</div>` : ''}
    </div>` : ''}

    <!-- Standard disclaimer -->
    <div style="margin:14px 42px 0;padding:11px 16px;background:#fbfbfd;border:1px solid ${line};border-radius:10px;">
      <div style="font-size:8.5px;color:#6b7688;line-height:1.55;text-align:justify;">
        <strong style="color:${navy};">Important:</strong> ${BOND_PDF_DISCLAIMER}
      </div>
    </div>

    <!-- Footer -->
    <div style="margin-top:18px;background:linear-gradient(135deg,${darkBlue} 0%,${navy} 100%);color:${white};padding:16px 42px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;">
      <div style="font-size:9px;line-height:1.5;color:#cfd8ea;">
        <div style="font-weight:800;color:${white};font-size:11px;">${NIYOM.name}</div>
        <div>${NIYOM.address}</div>
        <div>${NIYOM.email} &nbsp;•&nbsp; ${NIYOM.web}</div>
      </div>
      ${opts.contact ? `<div style="text-align:right;font-size:9.5px;color:#e7eefb;line-height:1.5;">
        <div style="font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:${goldSoft};">Your Relationship Manager</div>
        <div style="font-weight:800;color:${white};font-size:11.5px;margin-top:1px;">${esc(opts.contact.name)}</div>
        ${opts.contact.designation ? `<div style="color:${goldSoft};">${esc(opts.contact.designation)}</div>` : ''}
        ${opts.contact.phone ? `<div>${esc(opts.contact.phone)}</div>` : ''}
        ${opts.contact.email ? `<div>${esc(opts.contact.email)}</div>` : ''}
      </div>` : `<div style="text-align:right;font-size:8px;color:${goldSoft};">
        <div>Generated ${formatDate(new Date().toISOString())}</div>
        ${opts.generatedByName ? `<div>by ${esc(opts.generatedByName)}</div>` : ''}
      </div>`}
    </div>
  </div>`;
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve(); });
  }));
}

function fileBase(bond: NWBondCatalog): string {
  return `NIYOM_${(bond.bond_name || bond.company_name || bond.bond_code || 'bond')
    .replace(/[^\w]+/g, '_').replace(/_+/g, '_').slice(0, 60)}`;
}

// Render the brochure offscreen and hand the mounted node to a callback.
async function withRenderedNode<T>(bond: NWBondCatalog, opts: MarketingPdfOptions, fn: (node: HTMLElement) => Promise<T>): Promise<T> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = buildHtml(bond, opts);
  document.body.appendChild(container);
  try {
    await waitForImages(container);
    return await fn(container.firstElementChild as HTMLElement);
  } finally {
    document.body.removeChild(container);
  }
}

// PRIMARY: build the brochure and download it as a high-resolution PNG image
// (best for WhatsApp / email sharing).
export async function generateMarketingImage(bond: NWBondCatalog, opts: MarketingPdfOptions): Promise<void> {
  await withRenderedNode(bond, opts, async node => {
    const canvas = await html2canvas(node, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: 794,
    });
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase(bond)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

// Alternative: the same layout as an A4 PDF.
export async function generateMarketingPdf(bond: NWBondCatalog, opts: MarketingPdfOptions): Promise<void> {
  await withRenderedNode(bond, opts, async node => {
    const opt = {
      margin: 0,
      filename: `${fileBase(bond)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
      jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] as string[] },
    };
    await html2pdf().set(opt).from(node).save();
  });
}
