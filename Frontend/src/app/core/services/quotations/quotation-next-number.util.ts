import type { QuotationNextNumber, QuotationSettings } from './quotation-api.models';

/** Indian fiscal year label (April–March), e.g. 2025-26. */
export function fiscalYearLabelFor(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const startYear = m >= 4 ? y : y - 1;
  const endShort = (startYear + 1) % 100;
  return `${startYear}-${endShort.toString().padStart(2, '0')}`;
}

export function formatQuotationNumber(
  companyCode: string,
  docType: string,
  fiscalYear: string,
  sequence: number,
): string {
  const cc = companyCode.trim() || 'BCEPL';
  const dt = (docType || 'QTN').trim();
  const fy = fiscalYear.trim();
  return `${cc}/${dt}/${fy}/${sequence.toString().padStart(3, '0')}`;
}

export function defaultQuotationSettings(): QuotationSettings {
  return { companyCode: 'BCEPL', documentTypeCode: 'QTN' };
}

/** Client fallback when `GET /api/quotations/next-number` is unavailable. */
export function defaultQuotationNextNumber(companyCode = 'BCEPL'): QuotationNextNumber {
  const date = new Date();
  const fy = fiscalYearLabelFor(date);
  const cc = companyCode.trim() || 'BCEPL';
  return {
    companyCode: cc,
    documentTypeCode: 'QTN',
    fiscalYearLabel: fy,
    sequenceNumber: 1,
    quotationNumber: formatQuotationNumber(cc, 'QTN', fy, 1),
    quotationDate: date.toISOString().slice(0, 10),
  };
}
