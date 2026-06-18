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
  itemId?: number | null;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  uom: string;
  weight: number;
  unitWeight: number;
  steelRate: number;
  rate: number;
  itemSnapshotJson: string;
  discountPercent: number;
  gstPercent: number;
  amount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface QuotationGridColumnDto {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  width: number;
  editable: boolean;
}

export interface QuotationGridColumnsDto {
  columns: QuotationGridColumnDto[];
}

export interface QuotationTotalsDto {
  subtotal: number;
  additionalChargesTotal?: number;
  taxableAmount?: number;
  taxTotal: number;
  grandTotal: number;
  totalQuantity: number;
  totalWeight: number;
}

export interface QuotationAdditionalChargeDto {
  id?: number;
  sortIndex: number;
  chargeName: string;
  amount: number;
}

export interface QuotationUpsertDto {
  id?: number;
  dealId?: number | null;
  /** True when the linked deal is closed (Won/Lost). */
  dealClosed?: boolean;
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
  subtotal?: number;
  taxTotal?: number;
  gstPercent?: number;
  grandTotal?: number;
  totalQuantity?: number;
  totalWeight?: number;
  transportationCharges?: number;
  loadingCharges?: number;
  serviceCharges?: number;
  customCharges?: QuotationAdditionalChargeDto[];
  lineItems: QuotationLineItemDto[];
}

export interface QuotationListItem {
  id: number;
  /** `users.id` of creator; used for client-side scope checks when present. */
  createdBy?: number | null;
  dealId?: number | null;
  dealClosed?: boolean;
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
  /** Present on list API when the viewer is admin / super-admin. */
  createdByName?: string | null;
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
