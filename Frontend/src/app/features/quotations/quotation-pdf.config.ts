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
  /** Header/footer fill RGB */
  brandBlue: [30, 64, 120] as [number, number, number],
  /** Line-items table footer (total row) */
  tableFootFill: [45, 125, 125] as [number, number, number],
  tableHeadFill: [230, 236, 245] as [number, number, number],
};

/** Page layout (A4 portrait, mm) — keeps tables and totals column-aligned. */
export const QUOTATION_PDF_LAYOUT = {
  marginMm: 10,
  headerHeightMm: 34,
  footerHeightMm: 15,
  footerReserveMm: 28,
  sectionGapMm: 3,
  introGapMm: 4,
  /** Left header brand block — company text starts after this */
  brandBlockWidthMm: 46,
  /** Customer / quotation meta grid */
  metaLabelWidthMm: 30,
  metaValueRightLabelWidthMm: 24,
  metaValueRightWidthMm: 44,
  /** Line items: fixed widths; description fills remainder */
  lineSrWidthMm: 12,
  lineQtyWidthMm: 26,
  lineRateWidthMm: 30,
  lineAmountWidthMm: 30,
  /** Terms block uses this share of content width */
  termsWidthRatio: 0.58,
  /** Totals mini-table (label + amount), right edge aligns with line amount column */
  totalsLabelWidthMm: 42,
  /** Terms table column widths (mm) */
  termsIndexWidthMm: 8,
  termsTitleWidthMm: 28,
  /** Quotation number highlight in meta grid */
  qtnHighlightFill: [220, 235, 250] as [number, number, number],
  qtnHighlightText: [30, 64, 120] as [number, number, number],
  cellPaddingMm: 2,
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
