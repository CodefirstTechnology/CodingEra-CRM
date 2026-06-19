export interface QuotationAdditionalChargeDto {
  id?: number;
  sortIndex: number;
  chargeName: string;
  amount: number;
}

export interface QuotationAdditionalChargesInput {
  transportationCharges: number;
  loadingCharges: number;
  serviceCharges: number;
  customCharges: QuotationAdditionalChargeDto[];
}

export function normalizeChargeAmount(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function additionalChargesTotal(input: QuotationAdditionalChargesInput): number {
  const transport = normalizeChargeAmount(input.transportationCharges);
  const loading = normalizeChargeAmount(input.loadingCharges);
  const service = normalizeChargeAmount(input.serviceCharges);
  const custom = (input.customCharges ?? []).reduce(
    (sum, row) => sum + normalizeChargeAmount(row.amount),
    0,
  );
  return Math.round((transport + loading + service + custom) * 10000) / 10000;
}

export interface AdditionalChargeLine {
  label: string;
  amount: number;
}

export function listAdditionalChargeLines(
  input: QuotationAdditionalChargesInput,
): AdditionalChargeLine[] {
  const lines: AdditionalChargeLine[] = [];
  const transport = normalizeChargeAmount(input.transportationCharges);
  const loading = normalizeChargeAmount(input.loadingCharges);
  const service = normalizeChargeAmount(input.serviceCharges);

  if (transport > 0) lines.push({ label: 'Transportation Charges', amount: transport });
  if (loading > 0) lines.push({ label: 'Loading Charges', amount: loading });
  if (service > 0) lines.push({ label: 'Service Charges', amount: service });

  for (const row of input.customCharges ?? []) {
    const amount = normalizeChargeAmount(row.amount);
    const name = String(row.chargeName ?? '').trim();
    if (amount > 0) {
      lines.push({ label: name || 'Custom Charge', amount });
    }
  }

  return lines;
}

export function hasAdditionalCharges(input: QuotationAdditionalChargesInput): boolean {
  return listAdditionalChargeLines(input).length > 0;
}
