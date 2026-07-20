// Bond Creation module — client-facing marketing brochure generator.
//
// Produces a premium, NIYOM-branded A4 PDF suitable for direct sharing with
// clients. Dark-blue / white / gold palette. Sections: Cover → Bond Overview →
// Investment Highlights → Pricing → Risk → Disclaimer → Footer.
//
// CONFIDENTIALITY: this renderer only ever receives the employee-safe catalog
// shape plus a computed selling price. It NEVER references landing_cost, internal
// margin, internal notes, or admin remarks — those fields are not in its input.

import html2pdf from 'html2pdf.js';
import { NWBondCatalog } from './bondTypes';
import { NIYOM_BRAND, BOND_PDF_DISCLAIMER } from './bondConstants';
import { formatPercent, formatDate, formatINRFull } from './bondUtils';

const NIYOM_LOGO = '/niyomlogo.png';

const NIYOM = {
  name: 'NIYOM WEALTH DISTRIBUTION LLP',
  tagline: 'Wealth Distribution & Advisory',
  address: 'No 126, 1st Floor, Poonamalle High Road, Varalakshmi Nagar, Maduravoyal, Chennai – 600 095',
  email: 'support@niyomwealth.com',
  web: 'www.niyomwealth.com',
};

export interface MarketingPdfOptions {
  sellingPrice: number | null;   // client-facing price (already computed; NO cost)
  generatedByName?: string;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function safe(v: unknown): string {
  const s = String(v ?? '').trim();
  return s && s.toUpperCase() !== 'NA' ? esc(s) : '';
}

// A highlight tile (label + big value).
function tile(label: string, value: string, accent = false): string {
  const { gold, white, navy, goldSoft } = NIYOM_BRAND;
  return `
    <div style="flex:1;min-width:120px;background:${accent ? gold : 'rgba(255,255,255,0.06)'};border:1px solid ${accent ? gold : 'rgba(200,162,75,0.35)'};border-radius:12px;padding:14px 16px;">
      <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${accent ? navy : goldSoft};font-weight:700;">${label}</div>
      <div style="font-size:20px;font-weight:800;margin-top:6px;color:${accent ? navy : white};line-height:1.1;">${value || '—'}</div>
    </div>`;
}

// A key/value detail row (only rendered when a value exists).
function row(label: string, value: string): string {
  if (!value) return '';
  const { ink, line } = NIYOM_BRAND;
  return `
    <div style="display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid ${line};">
      <span style="font-size:11px;color:#5a6b85;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${label}</span>
      <span style="font-size:12px;color:${ink};font-weight:600;text-align:right;max-width:60%;">${value}</span>
    </div>`;
}

function buildHtml(bond: NWBondCatalog, opts: MarketingPdfOptions): string {
  const { darkBlue, navy, gold, goldSoft, white, ink, mist, line } = NIYOM_BRAND;
  const title = safe(bond.bond_name) || safe(bond.company_name) || 'Bond Investment Opportunity';
  const sellingPrice = opts.sellingPrice !== null && opts.sellingPrice !== undefined
    ? formatINRFull(opts.sellingPrice) : (bond.selling_price ? formatINRFull(bond.selling_price) : 'On Request');

  const highlights = [
    tile('Coupon', bond.coupon !== null ? formatPercent(bond.coupon) : safe(bond.coupon_text)),
    tile('Yield (YTM)', formatPercent(bond.yield_ytm)),
    tile('Maturity', bond.maturity_date ? formatDate(bond.maturity_date) : (safe(bond.maturity_text).split('(')[0] || '—')),
    tile('Rating', safe(bond.rating) || '—'),
  ].join('');

  const highlights2 = [
    tile('Interest Frequency', safe(bond.interest_frequency) || '—'),
    tile('Min. Investment', safe(bond.minimum_investment) || safe(bond.face_value_text) || '—'),
    tile('Selling Price', sellingPrice, true),
  ].join('');

  const overview = [
    row('Issuer', safe(bond.issuer) || safe(bond.company_name)),
    row('ISIN', safe(bond.isin)),
    row('Security Type', safe(bond.security_type)),
    row('Category', safe(bond.security_category)),
    row('Seniority', safe(bond.seniority)),
    row('Face Value', safe(bond.face_value_text)),
    row('Multiples', safe(bond.multiples)),
    row('Listing', safe(bond.listing_exchange)),
    row('Tax Status', safe(bond.tax_status)),
  ].join('');

  const structure = [
    row('Interest Payment Dates', safe(bond.interest_payment_dates)),
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

  return `
  <div style="width:794px;box-sizing:border-box;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:${white};color:${ink};">
    <!-- Cover band -->
    <div style="background:linear-gradient(135deg,${darkBlue} 0%,${navy} 100%);padding:30px 40px 26px;color:${white};position:relative;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${NIYOM_LOGO}" alt="Niyom Wealth" style="height:44px;width:auto;object-fit:contain;" />
          <div>
            <div style="font-size:16px;font-weight:800;letter-spacing:0.02em;">NIYOM WEALTH</div>
            <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${goldSoft};">${NIYOM.tagline}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:${goldSoft};font-weight:700;">Bond Investment</div>
          <div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:${goldSoft};font-weight:700;">Opportunity</div>
        </div>
      </div>

      <div style="margin-top:24px;">
        <div style="width:46px;height:3px;background:${gold};border-radius:2px;"></div>
        <h1 style="font-size:24px;font-weight:800;margin:14px 0 0;line-height:1.2;">${title}</h1>
        ${safe(bond.security_category) ? `<div style="margin-top:8px;display:inline-block;background:rgba(200,162,75,0.18);border:1px solid ${gold};color:${goldSoft};font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${safe(bond.security_category)}</div>` : ''}
      </div>
    </div>

    <!-- Highlights on the dark band continuation -->
    <div style="background:${navy};padding:0 40px 26px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;">${highlights}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;">${highlights2}</div>
    </div>

    <!-- Body: two-column detail -->
    <div style="padding:26px 40px 8px;">
      <div style="display:flex;gap:28px;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:0.1em;border-bottom:2px solid ${gold};padding-bottom:6px;margin-bottom:6px;">Bond Overview</div>
          ${overview}
        </div>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:800;color:${navy};text-transform:uppercase;letter-spacing:0.1em;border-bottom:2px solid ${gold};padding-bottom:6px;margin-bottom:6px;">Interest &amp; Redemption</div>
          ${structure}
        </div>
      </div>
    </div>

    <!-- Pricing band -->
    <div style="margin:16px 40px 0;background:${mist};border:1px solid ${line};border-left:4px solid ${gold};border-radius:12px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5a6b85;font-weight:700;">Indicative Selling Price</div>
        <div style="font-size:11px;color:#5a6b85;margin-top:4px;">Price per unit / lot as quoted. Availability subject to confirmation.</div>
      </div>
      <div style="font-size:30px;font-weight:900;color:${navy};">${sellingPrice}</div>
    </div>

    ${extraNotes || bondDisclaimer ? `
    <div style="margin:16px 40px 0;">
      ${extraNotes ? `<div style="font-size:11px;color:${ink};line-height:1.6;"><strong style="color:${navy};">Notes:</strong> ${extraNotes}</div>` : ''}
      ${bondDisclaimer ? `<div style="font-size:11px;color:${ink};line-height:1.6;margin-top:6px;"><strong style="color:${navy};">Disclaimer:</strong> ${bondDisclaimer}</div>` : ''}
    </div>` : ''}

    <!-- Standard disclaimer -->
    <div style="margin:18px 40px 0;padding:12px 16px;background:#fbfbfd;border:1px solid ${line};border-radius:10px;">
      <div style="font-size:9px;color:#6b7688;line-height:1.55;text-align:justify;">
        <strong style="color:${navy};">Important:</strong> ${BOND_PDF_DISCLAIMER}
      </div>
    </div>

    <!-- Footer -->
    <div style="margin-top:20px;background:linear-gradient(135deg,${darkBlue} 0%,${navy} 100%);color:${white};padding:16px 40px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:9px;line-height:1.5;color:#cfd8ea;">
        <div style="font-weight:800;color:${white};font-size:11px;">${NIYOM.name}</div>
        <div>${NIYOM.address}</div>
        <div>${NIYOM.email} &nbsp;•&nbsp; ${NIYOM.web}</div>
      </div>
      <div style="text-align:right;font-size:8px;color:${goldSoft};">
        <div>Generated ${formatDate(new Date().toISOString())}</div>
        ${opts.generatedByName ? `<div>by ${esc(opts.generatedByName)}</div>` : ''}
      </div>
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

function fileName(bond: NWBondCatalog): string {
  const base = (bond.bond_name || bond.company_name || bond.bond_code || 'bond')
    .replace(/[^\w]+/g, '_').replace(/_+/g, '_').slice(0, 60);
  return `NIYOM_${base}.pdf`;
}

// Build the brochure and trigger a download.
export async function generateMarketingPdf(bond: NWBondCatalog, opts: MarketingPdfOptions): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = buildHtml(bond, opts);
  document.body.appendChild(container);
  try {
    await waitForImages(container);
    const opt = {
      margin: 0,
      filename: fileName(bond),
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
      jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] as string[] },
    };
    await html2pdf().set(opt).from(container.firstElementChild as HTMLElement).save();
  } finally {
    document.body.removeChild(container);
  }
}
