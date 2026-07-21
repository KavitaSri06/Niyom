// Bond Creation module — promotional social creative (PNG).
//
// A portrait "card" image in the style of bond-marketplace promos, showing ONLY
// the headline product facts a client cares about — coupon, tenure, payout,
// rating, minimum investment — and NEVER any price/selling figure. Niyom-branded
// (dark + gold); no fabricated regulatory badges. Ends with the employee's
// contact so a client knows who to call.

import html2canvas from 'html2canvas';
import { NWBondCatalog } from './bondTypes';
import { NIYOM_BRAND } from './bondConstants';
import { formatPercent, formatDate, formatINR, inferFrequency, parseIndianAmount } from './bondUtils';
import { EmployeeContact } from './cashflowPdf';

const NIYOM_LOGO = '/niyomlogo.png';

export interface PromoOptions {
  contact?: EmployeeContact;
  newlyLaunched?: boolean;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
function safe(v: unknown): string { const s = String(v ?? '').trim(); return s && s.toUpperCase() !== 'NA' ? esc(s) : ''; }

function tenureLabel(bond: NWBondCatalog): string {
  if (safe(bond.tenure)) return safe(bond.tenure);
  if (bond.maturity_date) {
    const yrs = (new Date(bond.maturity_date).getTime() - Date.now()) / (365.25 * 864e5);
    if (yrs > 0) return yrs >= 1 ? `${yrs.toFixed(1)} yrs` : `${Math.round(yrs * 12)} months`;
  }
  return '—';
}

function pill(text: string): string {
  const { gold, goldSoft } = NIYOM_BRAND;
  return `<span style="display:inline-block;background:rgba(200,162,75,0.16);border:1px solid ${gold};color:${goldSoft};font-size:15px;font-weight:700;padding:6px 16px;border-radius:999px;">${text}</span>`;
}

function stat(label: string, value: string): string {
  const { goldSoft, white } = NIYOM_BRAND;
  return `
    <div style="text-align:center;flex:1;">
      <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${goldSoft};font-weight:700;">${label}</div>
      <div style="font-size:20px;font-weight:800;color:${white};margin-top:4px;">${value || '—'}</div>
    </div>`;
}

function buildHtml(bond: NWBondCatalog, opts: PromoOptions): string {
  const { darkBlue, navy, gold, goldSoft, white } = NIYOM_BRAND;
  const coupon = bond.coupon !== null ? formatPercent(bond.coupon) : (safe(bond.coupon_text) || '—');
  const payout = inferFrequency(bond.interest_frequency, bond.interest_payment_dates) || '—';
  const rating = safe(bond.rating) || '—';
  const tenure = tenureLabel(bond);
  const minInv = parseIndianAmount(bond.minimum_investment) ?? parseIndianAmount(bond.multiples) ?? bond.face_value;
  const minInvStr = minInv ? formatINR(minInv) : (safe(bond.face_value_text) || '—');
  const issuer = safe(bond.issuer) || safe(bond.company_name) || safe(bond.bond_name) || 'Bond Opportunity';
  const secBadges = [safe(bond.security_type), safe(bond.seniority)].filter(Boolean).slice(0, 2);
  const maturityStr = bond.maturity_date ? formatDate(bond.maturity_date) : (safe(bond.maturity_text).split('(')[0].trim() || '');
  const contact = opts.contact;

  return `
  <div style="width:820px;height:1025px;box-sizing:border-box;position:relative;overflow:hidden;
    font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:radial-gradient(120% 80% at 80% 0%,#183463 0%,${darkBlue} 45%,#050c18 100%);color:${white};padding:44px 46px;">
    <!-- glow streaks -->
    <div style="position:absolute;left:-120px;top:120px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(200,162,75,0.16),transparent 65%);"></div>
    <div style="position:absolute;right:-80px;bottom:-60px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(200,162,75,0.12),transparent 65%);"></div>

    <!-- brand row -->
    <div style="display:flex;justify-content:space-between;align-items:center;position:relative;">
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="${NIYOM_LOGO}" alt="Niyom Wealth" style="height:52px;width:auto;object-fit:contain;" />
        <div>
          <div style="font-size:22px;font-weight:800;letter-spacing:0.02em;">NIYOM WEALTH</div>
          <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${goldSoft};">Wealth Distribution &amp; Advisory</div>
        </div>
      </div>
      ${opts.newlyLaunched ? `<div style="background:#b0141d;color:#fff;font-size:12px;font-weight:800;letter-spacing:0.06em;padding:8px 16px;border-radius:12px;transform:rotate(4deg);box-shadow:0 6px 18px rgba(176,20,29,0.4);">NEWLY&nbsp;LAUNCHED</div>` : ''}
    </div>

    <!-- headline coupon (solid fill — html2canvas-safe) -->
    <div style="text-align:center;margin-top:56px;position:relative;">
      <div style="font-size:20px;letter-spacing:0.28em;text-transform:uppercase;color:${goldSoft};font-weight:700;">Earn up to</div>
      <div style="font-size:150px;font-weight:900;line-height:0.9;margin-top:6px;color:#F2DB99;text-shadow:0 3px 18px rgba(200,162,75,0.35);">${coupon}</div>
      <div style="font-size:20px;letter-spacing:0.16em;text-transform:uppercase;color:#cfd8ea;font-weight:600;margin-top:2px;">per annum</div>
    </div>

    <!-- issuer + badges -->
    <div style="text-align:center;margin-top:30px;position:relative;">
      <div style="font-size:30px;font-weight:800;line-height:1.15;">${issuer}</div>
      <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        ${secBadges.map(pill).join('')}
        ${safe(bond.security_category) ? pill(safe(bond.security_category)) : ''}
      </div>
    </div>

    <!-- stats strip -->
    <div style="margin-top:40px;position:relative;display:flex;gap:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(200,162,75,0.35);border-radius:18px;padding:22px 18px;">
      ${stat('Tenure', tenure)}
      <div style="width:1px;background:rgba(200,162,75,0.3);"></div>
      ${stat('Payout', payout)}
      <div style="width:1px;background:rgba(200,162,75,0.3);"></div>
      ${stat('Rating', rating)}
      <div style="width:1px;background:rgba(200,162,75,0.3);"></div>
      ${stat('Min. Invest', minInvStr)}
    </div>

    ${maturityStr ? `<div style="text-align:center;margin-top:18px;font-size:14px;color:#cfd8ea;position:relative;">Maturity: <strong style="color:${white};">${maturityStr}</strong></div>` : ''}

    <!-- contact CTA -->
    <div style="position:absolute;left:46px;right:46px;bottom:40px;">
      <div style="background:linear-gradient(135deg,${gold},#E9D8A0);border-radius:16px;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${navy};font-weight:800;opacity:0.8;">To invest, contact</div>
          <div style="font-size:20px;font-weight:900;color:${navy};margin-top:2px;">${contact ? esc(contact.name) : 'Niyom Wealth'}</div>
          ${contact?.designation ? `<div style="font-size:12px;color:${navy};opacity:0.85;">${esc(contact.designation)}</div>` : ''}
        </div>
        <div style="text-align:right;color:${navy};font-weight:700;font-size:14px;line-height:1.5;">
          ${contact?.phone ? `<div>Call ${esc(contact.phone)}</div>` : ''}
          <div style="font-size:12px;">${contact?.email ? esc(contact.email) : 'support@niyomwealth.com'}</div>
        </div>
      </div>
      <div style="text-align:center;font-size:10px;color:#8592a8;margin-top:12px;line-height:1.4;">
        Investments in bonds are subject to market, credit and interest-rate risks, including loss of principal. Rates indicative. Niyom Wealth Distribution LLP acts as a distributor.
      </div>
    </div>
  </div>`;
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => (img.complete && img.naturalWidth > 0)
    ? Promise.resolve()
    : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); })));
}

export async function generatePromoImage(bond: NWBondCatalog, opts: PromoOptions): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.innerHTML = buildHtml(bond, opts);
  document.body.appendChild(container);
  try {
    await waitForImages(container);
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2, useCORS: true, backgroundColor: '#050c18', logging: false, windowWidth: 820, windowHeight: 1025,
    });
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `NIYOM_Promo_${(bond.company_name || bond.bond_code || 'bond').replace(/[^\w]+/g, '_').slice(0, 50)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  } finally {
    document.body.removeChild(container);
  }
}
