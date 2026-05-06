/** Parse form or legacy display strings into a numeric amount (no currency formatting). */
export function parseRevenueInputToNumber(raw: string | number | undefined | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '').replace(/[₹,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
