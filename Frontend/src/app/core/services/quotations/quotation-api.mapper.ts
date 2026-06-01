import type {
  QuotationLineItemDto,
  QuotationListItem,
  QuotationNextNumber,
  QuotationSettings,
  QuotationUpsertDto,
} from './quotation-api.models';

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string') return v;
    if (v != null && typeof v !== 'object') return String(v);
  }
  return '';
}

function pickNum(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function pickNullableNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (v == null) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function extractQuotationList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = asRecord(raw);
  for (const k of ['data', 'items', 'value', 'result']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

export function mapQuotationListItem(raw: unknown): QuotationListItem {
  const o = asRecord(raw);
  return {
    id: pickNum(o, ['id', 'Id']),
    dealId: pickNullableNum(o, ['dealId', 'deal_id', 'DealId']),
    customerName: pickStr(o, ['customerName', 'customer_name']),
    companyName: pickStr(o, ['companyName', 'company_name']),
    contactPerson: pickStr(o, ['contactPerson', 'contact_person']),
    mobileNumber: pickStr(o, ['mobileNumber', 'mobile_number']),
    emailAddress: pickStr(o, ['emailAddress', 'email_address']),
    referenceNumber: pickStr(o, ['referenceNumber', 'reference_number']),
    quotationNumber: pickStr(o, ['quotationNumber', 'quotation_number']),
    quotationDate: pickStr(o, ['quotationDate', 'quotation_date']),
    status: pickStr(o, ['status', 'Status']) || 'Draft',
    grandTotal: pickNum(o, ['grandTotal', 'grand_total']),
    createdAt: pickStr(o, ['createdAt', 'created_at']) || undefined,
    updatedAt: pickStr(o, ['updatedAt', 'updated_at']) || undefined,
  };
}

function mapLineItem(raw: unknown, index: number): QuotationLineItemDto {
  const o = asRecord(raw);
  const qty = pickNum(o, ['quantity', 'Quantity']) || 1;
  const rate = pickNum(o, ['rate', 'Rate']);
  const amount = pickNum(o, ['amount', 'Amount']) || qty * rate;
  return {
    id: pickNum(o, ['id', 'Id']) || undefined,
    lineIndex: pickNum(o, ['lineIndex', 'line_index']) || index,
    itemCode: pickStr(o, ['itemCode', 'item_code']),
    description: pickStr(o, ['description', 'Description']),
    quantity: qty,
    uom: pickStr(o, ['uom', 'Uom']),
    rate,
    amount,
  };
}

export function mapQuotationDetail(raw: unknown): QuotationUpsertDto {
  const o = asRecord(raw);
  const linesRaw = o['lineItems'] ?? o['line_items'] ?? o['LineItems'];
  const lines = Array.isArray(linesRaw)
    ? linesRaw.map((item, i) => mapLineItem(item, i))
    : [];

  let firstName = pickStr(o, ['firstName', 'first_name']);
  let lastName = pickStr(o, ['lastName', 'last_name']);
  const customerName = pickStr(o, ['customerName', 'customer_name']);
  if (!firstName && !lastName && customerName) {
    const parts = customerName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ');
    } else {
      firstName = customerName;
    }
  }

  return {
    id: pickNum(o, ['id', 'Id']) || undefined,
    dealId: pickNullableNum(o, ['dealId', 'deal_id']),
    salutation: pickStr(o, ['salutation', 'Salutation']),
    firstName,
    lastName,
    gender: pickStr(o, ['gender', 'Gender']),
    customerName: customerName || [firstName, lastName].filter(Boolean).join(' '),
    companyName: pickStr(o, ['companyName', 'company_name']),
    employees: pickStr(o, ['employees', 'Employees']),
    annualRevenue: pickNullableNum(o, ['annualRevenue', 'annual_revenue']),
    website: pickStr(o, ['website', 'Website']),
    gst: pickStr(o, ['gst', 'Gst']),
    territory: pickStr(o, ['territory', 'Territory']),
    industry: pickStr(o, ['industry', 'Industry']),
    contactPerson: pickStr(o, ['contactPerson', 'contact_person']),
    mobileNumber: pickStr(o, ['mobileNumber', 'mobile_number']),
    emailAddress: pickStr(o, ['emailAddress', 'email_address']),
    officeAddress: pickStr(o, ['officeAddress', 'office_address']),
    siteAddress: pickStr(o, ['siteAddress', 'site_address']),
    referenceNumber: pickStr(o, ['referenceNumber', 'reference_number']),
    referenceDate: pickStr(o, ['referenceDate', 'reference_date']) || null,
    companyCode: pickStr(o, ['companyCode', 'company_code']),
    documentTypeCode: pickStr(o, ['documentTypeCode', 'document_type_code']) || 'QTN',
    fiscalYearLabel: pickStr(o, ['fiscalYearLabel', 'fiscal_year_label']),
    sequenceNumber: pickNum(o, ['sequenceNumber', 'sequence_number']),
    quotationNumber: pickStr(o, ['quotationNumber', 'quotation_number']),
    quotationDate: pickStr(o, ['quotationDate', 'quotation_date']) || null,
    status: pickStr(o, ['status', 'Status']) || 'Draft',
    remarks: pickStr(o, ['remarks', 'Remarks']),
    lineItems: lines,
  };
}

export function mapNextNumber(raw: unknown): QuotationNextNumber {
  const o = asRecord(raw);
  return {
    companyCode: pickStr(o, ['companyCode', 'company_code']),
    documentTypeCode: pickStr(o, ['documentTypeCode', 'document_type_code']) || 'QTN',
    fiscalYearLabel: pickStr(o, ['fiscalYearLabel', 'fiscal_year_label']),
    sequenceNumber: pickNum(o, ['sequenceNumber', 'sequence_number']),
    quotationNumber: pickStr(o, ['quotationNumber', 'quotation_number']),
    quotationDate: pickStr(o, ['quotationDate', 'quotation_date']),
  };
}

export function mapSettings(raw: unknown): QuotationSettings {
  const o = asRecord(raw);
  return {
    companyCode: pickStr(o, ['companyCode', 'company_code']),
    documentTypeCode: pickStr(o, ['documentTypeCode', 'document_type_code']) || 'QTN',
  };
}

export function toApiUpsertBody(dto: QuotationUpsertDto): Record<string, unknown> {
  return {
    id: dto.id ?? 0,
    dealId: dto.dealId ?? null,
    salutation: dto.salutation ?? '',
    firstName: dto.firstName ?? '',
    lastName: dto.lastName ?? '',
    gender: dto.gender ?? '',
    customerName: dto.customerName,
    companyName: dto.companyName,
    employees: dto.employees ?? '',
    annualRevenue: dto.annualRevenue ?? null,
    website: dto.website ?? '',
    gst: dto.gst ?? '',
    territory: dto.territory ?? '',
    industry: dto.industry ?? '',
    contactPerson: dto.contactPerson,
    mobileNumber: dto.mobileNumber,
    emailAddress: dto.emailAddress,
    officeAddress: dto.officeAddress,
    siteAddress: dto.siteAddress,
    referenceNumber: dto.referenceNumber,
    referenceDate: dto.referenceDate || null,
    companyCode: dto.companyCode,
    documentTypeCode: dto.documentTypeCode,
    fiscalYearLabel: dto.fiscalYearLabel,
    sequenceNumber: dto.sequenceNumber,
    quotationNumber: dto.quotationNumber,
    quotationDate: dto.quotationDate || null,
    status: dto.status,
    remarks: dto.remarks,
    lineItems: dto.lineItems.map((l, i) => ({
      id: l.id ?? 0,
      lineIndex: l.lineIndex ?? i,
      itemCode: l.itemCode,
      description: l.description,
      quantity: l.quantity,
      uom: l.uom,
      rate: l.rate,
      amount: l.amount,
    })),
  };
}
