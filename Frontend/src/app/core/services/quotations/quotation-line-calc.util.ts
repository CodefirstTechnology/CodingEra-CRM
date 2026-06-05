export interface QuotationLineAmounts {
  amount: number;
  taxAmount: number;
  lineTotal: number;
  lineWeight: number;
}

export interface QuotationLineTotals {
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  totalQuantity: number;
  totalWeight: number;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function calculateQuotationLine(
  quantity: number,
  unitRate: number,
  discountPercent: number,
  gstPercent: number,
  weight: number,
  unitWeight: number,
): QuotationLineAmounts {
  const qty = quantity < 0 ? 0 : quantity;
  const rate = unitRate < 0 ? 0 : unitRate;
  const disc = discountPercent < 0 ? 0 : discountPercent > 100 ? 100 : discountPercent;
  const gst = gstPercent < 0 ? 0 : gstPercent;

  const amount = round4(qty * rate);
  const afterDiscount = round4(amount * (1 - disc / 100));
  const taxAmount = round4(afterDiscount * (gst / 100));
  const lineTotal = round4(afterDiscount + taxAmount);
  const lineWeight = weight > 0 ? weight : round4(qty * (unitWeight < 0 ? 0 : unitWeight));

  return { amount, taxAmount, lineTotal, lineWeight };
}

export function aggregateQuotationLines(
  rows: { quantity: number; amounts: QuotationLineAmounts }[],
): QuotationLineTotals {
  const subtotal = round4(rows.reduce((s, r) => s + (r.amounts.lineTotal - r.amounts.taxAmount), 0));
  const taxTotal = round4(rows.reduce((s, r) => s + r.amounts.taxAmount, 0));
  const grandTotal = round4(rows.reduce((s, r) => s + r.amounts.lineTotal, 0));
  const totalQuantity = round4(rows.reduce((s, r) => s + (r.quantity < 0 ? 0 : r.quantity), 0));
  const totalWeight = round4(rows.reduce((s, r) => s + r.amounts.lineWeight, 0));
  return { subtotal, taxTotal, grandTotal, totalQuantity, totalWeight };
}

export function recalcLineGroupValues(raw: {
  quantity: number;
  rate: number;
  discountPercent: number;
  gstPercent: number;
  weight: number;
  unitWeight: number;
}): QuotationLineAmounts {
  return calculateQuotationLine(
    Number(raw.quantity) || 0,
    Number(raw.rate) || 0,
    Number(raw.discountPercent) || 0,
    Number(raw.gstPercent) || 0,
    Number(raw.weight) || 0,
    Number(raw.unitWeight) || 0,
  );
}
