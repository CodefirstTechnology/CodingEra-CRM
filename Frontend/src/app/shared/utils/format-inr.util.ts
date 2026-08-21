/** Approximate USD → INR rate for dashboard demo metrics. */
export const USD_TO_INR_RATE = 83;

/** Formats a USD amount as compact Indian Rupees (Cr / L). */
export function formatUsdAsInr(usdAmount: number): string {
  const inr = usdAmount * USD_TO_INR_RATE;
  return formatInrCompact(inr);
}

/** Formats an INR amount in Cr (≥1 crore) or L (≥1 lakh). */
export function formatInrCompact(inr: number): string {
  if (!Number.isFinite(inr)) return '₹0';
  const abs = Math.abs(inr);
  if (abs >= 10_000_000) {
    const cr = inr / 10_000_000;
    const rounded = cr >= 100 ? Math.round(cr) : Math.round(cr * 10) / 10;
    return `₹${rounded} Cr`;
  }
  if (abs >= 100_000) {
    const lakhs = inr / 100_000;
    const rounded = Math.round(lakhs * 10) / 10;
    return `₹${rounded} L`;
  }
  return `₹${Math.round(inr).toLocaleString('en-IN')}`;
}

/**
 * Formats currency in the Indian Numbering System:
 * - >= 1 Crore (1,00,00,000): ₹X.XX Cr (e.g. ₹1.25 Cr)
 * - >= 1 Lakh (1,00,000): ₹X.XX Lakh (e.g. ₹6.00 Lakh)
 * - >= 1 Thousand (1,000): ₹X,XXX (e.g. ₹4,500)
 * - < 1 Thousand: ₹XXX (e.g. ₹500)
 */
export function formatIndianCurrency(inr: number | null | undefined): string {
  if (inr == null || !Number.isFinite(inr)) return '₹0';
  const sign = inr < 0 ? '-' : '';
  const abs = Math.abs(inr);

  if (abs >= 10_000_000) {
    const cr = abs / 10_000_000;
    const formatted = cr >= 100 ? cr.toFixed(1) : cr.toFixed(2);
    return `${sign}₹${formatted} Cr`;
  }
  if (abs >= 100_000) {
    const lakhs = abs / 100_000;
    const formatted = lakhs >= 100 ? lakhs.toFixed(1) : lakhs.toFixed(2);
    return `${sign}₹${formatted} Lakh`;
  }
  if (abs >= 1_000) {
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
  }
  return `${sign}₹${Math.round(abs)}`;
}
