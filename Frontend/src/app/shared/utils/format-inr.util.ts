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
