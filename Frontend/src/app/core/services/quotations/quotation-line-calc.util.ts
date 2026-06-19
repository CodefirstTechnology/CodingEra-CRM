export interface QuotationLineAmounts {
  amount: number;
  taxAmount: number;
  lineTotal: number;
  lineWeight: number;
}

export interface QuotationLineTotals {
  subtotal: number;
  additionalChargesTotal: number;
  taxableAmount: number;
  taxTotal: number;
  grandTotal: number;
  totalQuantity: number;
  totalWeight: number;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Line total before quotation-level GST. */
export function calculateQuotationLine(
  quantity: number,
  unitRate: number,
  discountPercent: number,
  weight: number,
  unitWeight: number,
): QuotationLineAmounts {
  const qty = quantity < 0 ? 0 : quantity;
  const rate = unitRate < 0 ? 0 : unitRate;
  const disc = discountPercent < 0 ? 0 : discountPercent > 100 ? 100 : discountPercent;

  const amount = round4(qty * rate);
  const afterDiscount = round4(amount * (1 - disc / 100));
  const lineWeight = weight > 0 ? weight : round4(qty * (unitWeight < 0 ? 0 : unitWeight));

  return { amount: afterDiscount, taxAmount: 0, lineTotal: afterDiscount, lineWeight };
}

/** Legacy per-line GST (old quotations). */
export function calculateQuotationLineLegacy(
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

export function resolveUnitRate(unitWeight: number, steelRate: number, fallbackRate: number): number {
  if (unitWeight > 0 && steelRate > 0) {
    return round4(unitWeight * steelRate);
  }
  return fallbackRate < 0 ? 0 : fallbackRate;
}

export function aggregateQuotationLines(
  rows: { quantity: number; amounts: QuotationLineAmounts }[],
  headerGstPercent = 0,
  additionalChargesTotal = 0,
): QuotationLineTotals {
  const lineSubtotal = round4(rows.reduce((s, r) => s + r.amounts.lineTotal, 0));
  const totalQuantity = round4(rows.reduce((s, r) => s + (r.quantity < 0 ? 0 : r.quantity), 0));
  const totalWeight = round4(rows.reduce((s, r) => s + r.amounts.lineWeight, 0));
  const additional = additionalChargesTotal < 0 ? 0 : additionalChargesTotal;
  const taxableAmount = round4(lineSubtotal + additional);

  const legacyTax = round4(rows.reduce((s, r) => s + r.amounts.taxAmount, 0));
  if (headerGstPercent > 0) {
    const taxTotal = round4(taxableAmount * (headerGstPercent / 100));
    const grandTotal = round4(taxableAmount + taxTotal);
    return {
      subtotal: lineSubtotal,
      additionalChargesTotal: additional,
      taxableAmount,
      taxTotal,
      grandTotal,
      totalQuantity,
      totalWeight,
    };
  }

  if (legacyTax > 0) {
    const grandTotal = round4(rows.reduce((s, r) => s + r.amounts.lineTotal, 0) + additional);
    const subtotal = round4(grandTotal - legacyTax);
    return {
      subtotal,
      additionalChargesTotal: additional,
      taxableAmount: round4(subtotal + additional),
      taxTotal: legacyTax,
      grandTotal,
      totalQuantity,
      totalWeight,
    };
  }

  return {
    subtotal: lineSubtotal,
    additionalChargesTotal: additional,
    taxableAmount,
    taxTotal: 0,
    grandTotal: taxableAmount,
    totalQuantity,
    totalWeight,
  };
}

export function recalcLineGroupValues(raw: {
  quantity: number;
  rate: number;
  discountPercent: number;
  gstPercent: number;
  weight: number;
  unitWeight: number;
  steelRate?: number;
}): QuotationLineAmounts {
  const rate =
    raw.gstPercent > 0
      ? Number(raw.rate) || 0
      : resolveUnitRate(Number(raw.unitWeight) || 0, Number(raw.steelRate) || 0, Number(raw.rate) || 0);

  if (raw.gstPercent > 0) {
    return calculateQuotationLineLegacy(
      Number(raw.quantity) || 0,
      rate,
      Number(raw.discountPercent) || 0,
      Number(raw.gstPercent) || 0,
      Number(raw.weight) || 0,
      Number(raw.unitWeight) || 0,
    );
  }

  return calculateQuotationLine(
    Number(raw.quantity) || 0,
    rate,
    Number(raw.discountPercent) || 0,
    Number(raw.weight) || 0,
    Number(raw.unitWeight) || 0,
  );
}
