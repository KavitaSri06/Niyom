// Dedicated, compliance-focused "Regulatory Information" block for the site
// footer. Single source of truth for the AMFI/ARN disclosures so the wording
// stays consistent across the site and with the Risk Disclosure / Disclaimer
// page. Styled to match the existing dark footer theme (gold #c9b896 heading,
// muted gray body) without altering the surrounding footer layout.

export function RegulatoryInfo() {
  const items = [
    { label: 'AMFI Reg No.', value: 'ARN-362707' },
    { label: 'Date of Initial Registration', value: '12-JUN-2026' },
    { label: 'Current ARN Validity', value: '11-JUN-2029' },
  ];

  return (
    <div className="pt-8 mb-8 border-t border-gray-800">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#c9b896] mb-5 text-center md:text-left">
        Regulatory Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 text-center md:text-left">
        {items.map((it) => (
          <div key={it.label}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{it.label}</p>
            <p className="text-sm text-gray-200 font-medium mt-1">{it.value}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-300 font-medium mt-6 text-center md:text-left">
        AMFI Registered Mutual Fund Distributor
      </p>

      <p className="text-xs text-gray-500 leading-relaxed mt-3 text-center md:text-left">
        Mutual fund investments are subject to market risks. Past performance does not indicate
        future performance of the schemes of the fund. Please read all scheme-related offer
        documents carefully before investing.
      </p>
    </div>
  );
}
