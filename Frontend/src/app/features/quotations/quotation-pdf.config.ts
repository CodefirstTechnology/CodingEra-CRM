/** Header/footer brand blue — must match company quotation template (#004085). */
export const QUOTATION_PDF_BRAND_BLUE_HEX = '#004085';

function pdfHexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Quotation PDF styling defaults; company content comes from Company Profile settings. */
export const QUOTATION_PDF_COMPANY = {
  brandName: '',
  brandTagline: '',
  legalName: '',
  businessLine: '',
  gstin: '',
  cin: '',
  signatureEntity: '',
  address: '',
  contactPhone: '',
  emails: [] as string[],
  website: '',
  jurisdiction: '',
  introText: '',
  transportationLabel: '',
  defaultGstPercent: 18,
  terms: [] as { title: string; body: string }[],
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  /** Header/footer fill RGB — derived from {@link QUOTATION_PDF_BRAND_BLUE_HEX} */
  brandBlue: pdfHexToRgb(QUOTATION_PDF_BRAND_BLUE_HEX),
  /** Line-items table footer (total row) */
  tableFootFill: [45, 125, 125] as [number, number, number],
  tableHeadFill: [230, 236, 245] as [number, number, number],
};

/** Page layout (A4 portrait, mm) — keeps tables and totals column-aligned. */
export const QUOTATION_PDF_LAYOUT = {
  marginMm: 14,
  headerHeightMm: 24,
  /** Footer bar height — mirrors header visual weight */
  footerHeightMm: 18,
  /** Content must stay above this Y offset from page bottom (footer bar top + small gap). */
  footerReserveMm: 34,
  sectionGapMm: 2,
  /** Minimum painted height for an empty product-table spacer row (mm). */
  blankRowHeightMm: 6,
  introGapMm: 4,
  /** Left header column width — logo area; right text uses remaining content width */
  brandBlockWidthMm: 50,
  /** Horizontal inset for header text inside the blue block */
  headerTextPadMm: 2,
  /** White logo plate width inside the brand column (full header height). */
  logoPlateWidthMm: 34,
  /** Max logo width/height (mm) inside the blue header */
  logoMaxWidthMm: 30,
  logoMaxHeightMm: 22,
  /** Inset between logo and logo-plate edges */
  logoBoxPaddingMm: 1.5,
  /** Max logo pixel dimension before PDF embed (avoids huge PNG decode in jsPDF) */
  logoMaxPx: 400,
  /** Customer / quotation meta grid */
  metaLabelWidthMm: 30,
  metaValueRightLabelWidthMm: 24,
  metaValueRightWidthMm: 44,
  /** Line items: fixed widths; description fills remainder */
  lineSrWidthMm: 12,
  lineQtyWidthMm: 26,
  lineRateWidthMm: 30,
  lineAmountWidthMm: 30,
  /** Fallback minima used when estimating product head / total row height */
  lineItemHeadHeightMm: 8,
  lineItemFootHeightMm: 8,
  /** Jurisdiction + signatory row below Terms & Conditions */
  closingRowHeightMm: 8,
  closingRowPaddingMm: { top: 1.5, right: 1.2, bottom: 1.5, left: 1.2 },
  /** Terms block (index + title + detail) uses this share of content width */
  termsWidthRatio: 0.68,
  /** Totals mini-table (label + amount), right edge aligns with line amount column */
  totalsLabelWidthMm: 42,
  /** Terms table column widths (mm) */
  termsIndexWidthMm: 8,
  termsTitleWidthMm: 28,
  /** Quotation number highlight in meta grid */
  qtnHighlightFill: [220, 235, 250] as [number, number, number],
  qtnHighlightText: [30, 64, 120] as [number, number, number],
  cellPaddingMm: 1.2,
  footerMinCellHeightMm: 4,
  termsDetailCellPaddingMm: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 },
  totalsCellPaddingMm: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 },
  introCellPaddingMm: { top: 1, right: 1.2, bottom: 1, left: 1.2 },
  fontSize: {
    headerBrand: 13,
    headerLegal: 10.5,
    headerSub: 7,
    body: 8,
    intro: 8.5,
    terms: 7.5,
    footer: 6.5,
  },
};
