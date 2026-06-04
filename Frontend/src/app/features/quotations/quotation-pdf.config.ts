/** Company quotation PDF template (Buildrich). */
export const QUOTATION_PDF_COMPANY = {
  brandName: 'BUILDRICH',
  brandTagline: 'Empowering Construction Excellence',
  legalName: 'Buildrich Construction Equipment Pvt. Ltd',
  businessLine:
    'Manufacturing, Hiring & Supplier of : Construction Machinery, Equipment & Scaffolding Materials',
  gstin: '27AAJCB6955B1ZM',
  cin: 'U29100PN2021PTC199255',
  signatureEntity: 'BUILDRICH CONSTRUCTION EQUIPMENT PVT LTD',
  address:
    'Sr. No. 31/5/1, Besides Akemi Business School, Marunji Road, Marunji (Wakad), Tal - Mulshi, Dist- Pune - 411057.',
  contactPhone: '+91 97656 57138',
  emails: ['info@buildrich.in', 'scaffolding@buildrich.in'],
  website: 'www.buildrich.in',
  jurisdiction: 'Subject to Pune Jurisdiction',
  introText:
    'Dear Sir, With reference to your requirements, we are pleased to submit our most reasonable offer for your approval and assuring you of our best services at all times.',
  transportationLabel: 'Extra At Actual',
  defaultGstPercent: 18,
  terms: [
    {
      title: 'Order & Payment',
      body: 'Order to be placed on BUILDRICH CONSTRUCTION EQUIPMENT PVT LTD. Bank: ICICI Bank, A/c No. 777705691133, IFSC: ICIC0000986, Branch: Hinjawadi, Pune 411057.',
    },
    { title: 'Delivery Period', body: 'within 5-6 days from the date of PO.' },
    { title: 'Taxes', body: 'Extra at actual.' },
    { title: 'Payment Terms', body: '70% Advance.' },
    { title: 'Transportation', body: 'Transport from Ex Factory Pune.' },
    { title: 'Validity', body: '7 days from the mentioned date of Quotation.' },
  ],
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
  termsWidthRatio: 0.54,
  /** Totals mini-table (label + amount), right edge aligns with line amount column */
  totalsLabelWidthMm: 42,
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
