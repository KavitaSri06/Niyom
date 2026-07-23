// Brand palette, disclaimer, company + contact types for client-facing outputs.

export const NIYOM_BRAND = {
  darkBlue: '#0B1F3A', navy: '#12294d', gold: '#C8A24B', goldSoft: '#E4CE92',
  white: '#FFFFFF', ink: '#1a2436', mist: '#F4F6FB', line: '#DCE3EF',
};

export const NIYOM = {
  name: 'NIYOM WEALTH DISTRIBUTION LLP',
  tagline: 'Wealth Distribution & Advisory',
  address: 'No 126, 1st Floor, Poonamalle High Road, Varalakshmi Nagar, Maduravoyal, Chennai – 600 095',
  email: 'support@niyomwealth.com',
  web: 'www.niyomwealth.com',
};

export const BOND_PDF_DISCLAIMER =
  'This document is for information purposes only and does not constitute an offer, ' +
  'solicitation, or investment advice. Investments in bonds and debt securities are ' +
  'subject to market, credit, interest-rate, and liquidity risks, including possible ' +
  'loss of principal. Yields and cashflows are indicative, computed on the quoted price ' +
  'and assume the security is held to maturity; actual returns may differ. Ratings are ' +
  'assigned by third-party agencies and are subject to revision. Prices and availability ' +
  'are indicative and subject to change without notice. Please read all issue documents ' +
  'and consult your financial advisor before investing. Niyom Wealth Distribution LLP acts ' +
  'as a distributor.';

export interface EmployeeContact { name: string; phone?: string; email?: string; designation?: string; }

export const MARGIN_PRESETS = [
  { label: '1%', value: 1 }, { label: '2%', value: 2 }, { label: '2.5%', value: 2.5 },
];
