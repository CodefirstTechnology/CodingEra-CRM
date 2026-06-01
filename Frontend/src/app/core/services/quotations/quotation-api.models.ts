export type QuotationStatus = 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Expired';

export const QUOTATION_STATUSES: QuotationStatus[] = [
  'Draft',
  'Sent',
  'Approved',
  'Rejected',
  'Expired',
];

export interface QuotationLineItemDto {
  id?: number;
  lineIndex: number;
  itemCode: string;
  description: string;
  quantity: number;
  uom: string;
  rate: number;
  amount: number;
}

export interface QuotationUpsertDto {
  id?: number;
  dealId?: number | null;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  customerName: string;
  companyName: string;
  employees?: string;
  annualRevenue?: number | null;
  website?: string;
  gst?: string;
  territory?: string;
  industry?: string;
  contactPerson: string;
  mobileNumber: string;
  emailAddress: string;
  officeAddress: string;
  siteAddress: string;
  referenceNumber: string;
  referenceDate?: string | null;
  companyCode: string;
  documentTypeCode: string;
  fiscalYearLabel: string;
  sequenceNumber: number;
  quotationNumber: string;
  quotationDate?: string | null;
  status: QuotationStatus | string;
  remarks: string;
  lineItems: QuotationLineItemDto[];
}

export interface QuotationListItem {
  id: number;
  dealId?: number | null;
  customerName: string;
  companyName: string;
  contactPerson: string;
  mobileNumber: string;
  emailAddress: string;
  referenceNumber: string;
  quotationNumber: string;
  quotationDate: string;
  status: QuotationStatus | string;
  grandTotal: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuotationNextNumber {
  companyCode: string;
  documentTypeCode: string;
  fiscalYearLabel: string;
  sequenceNumber: number;
  quotationNumber: string;
  quotationDate: string;
}

export interface QuotationSettings {
  companyCode: string;
  documentTypeCode: string;
}
