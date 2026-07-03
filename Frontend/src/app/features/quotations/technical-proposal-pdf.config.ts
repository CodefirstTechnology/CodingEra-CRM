import { QUOTATION_PDF_BRAND_BLUE_HEX } from './quotation-pdf.config';

function pdfHexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Technical Proposal PDF layout (A4 portrait, mm). */
export const TECHNICAL_PROPOSAL_PDF_LAYOUT = {
  marginMm: 14,
  logoMaxWidthMm: 45,
  logoMaxHeightMm: 20,
  logoMaxPx: 400,
  logoPadMm: 1,
  titleGapMm: 2,
  footerHeightMm: 12,
  footerReserveMm: 18,
  sectionGapMm: 3,
  /** Fixed label column widths so left/right meta values align. */
  metaLeftLabelWidthMm: 28,
  metaRightLabelWidthMm: 24,
  metaLineHeightMm: 4.2,
  titleLineHeightMm: 4.5,
  bodyLineHeightMm: 4.2,
  lineSrWidthMm: 14,
  lineQtyWidthMm: 24,
  lineWeightWidthMm: 26,
  lineRateWidthMm: 32,
  lineAmountWidthMm: 32,
  /** Line-items table cell padding (mm). */
  tableHeadCellPaddingMm: { top: 1.6, bottom: 1.6, left: 1.2, right: 1.2 },
  tableBodyCellPaddingMm: 1.2,
  tableHeadMinHeightMm: 7,
  tableHeadFontSize: 8.5,
  brandBlue: pdfHexToRgb(QUOTATION_PDF_BRAND_BLUE_HEX),
  bodyText: [0, 0, 0] as [number, number, number],
  fontSize: {
    title: 11,
    meta: 10,
    body: 10,
    salutation: 10,
    sectionTitle: 10,
    footer: 7,
  },
};

export function currencySymbol(code: string): string {
  const c = (code ?? 'INR').trim().toUpperCase();
  switch (c) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'AED':
      return 'AED ';
    case 'INR':
    default:
      return '₹';
  }
}
