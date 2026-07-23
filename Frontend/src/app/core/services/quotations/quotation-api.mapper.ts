import type {
  QuotationGridColumnDto,
  QuotationGridColumnsDto,
  QuotationLineItemDto,
  QuotationListItem,
  QuotationNextNumber,
  QuotationSettings,
  QuotationTerm,
  QuotationUpsertDto,
  TechnicalProposalPayload,
} from './quotation-api.models';
import { normalizeQuotationTemplateType } from './quotation-template.constants';
import { normalizeGstin } from '../../../shared/utils/gstin.util';
import { recalcLineGroupValues } from './quotation-line-calc.util';
import {
  inboundCompany,
  inboundEmail,
  inboundGender,
  inboundMaster,
  inboundMobile,
  inboundPerson,
} from '../../../shared/utils/text-normalizer/inbound-format';

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

function pickBool(o: Record<string, unknown>, keys: string[]): boolean {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1) return true;
    if (v === 'false' || v === 0) return false;
  }
  return false;
}

function pickBoolOrDefault(o: Record<string, unknown>, keys: string[], defaultValue: boolean): boolean {
  for (const k of keys) {
    if (!(k in o)) continue;
    const v = o[k];
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1) return true;
    if (v === 'false' || v === 0) return false;
  }
  return defaultValue;
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
    createdBy: pickNullableNum(o, ['createdBy', 'created_by', 'CreatedBy']),
    dealId: pickNullableNum(o, ['dealId', 'deal_id', 'DealId']),
    dealClosed: pickBool(o, ['dealClosed', 'deal_closed', 'DealClosed']),
    customerName: inboundPerson(pickStr(o, ['customerName', 'customer_name'])),
    companyName: inboundCompany(pickStr(o, ['companyName', 'company_name'])),
    contactPerson: inboundPerson(pickStr(o, ['contactPerson', 'contact_person'])),
    mobileNumber: inboundMobile(pickStr(o, ['mobileNumber', 'mobile_number'])),
    emailAddress: inboundEmail(pickStr(o, ['emailAddress', 'email_address'])),
    referenceNumber: pickStr(o, ['referenceNumber', 'reference_number']),
    quotationNumber: pickStr(o, ['quotationNumber', 'quotation_number']),
    quotationDate: pickStr(o, ['quotationDate', 'quotation_date']),
    status: inboundMaster('quotationStatus', pickStr(o, ['status', 'Status'])) || 'Draft',
    grandTotal: pickNum(o, ['grandTotal', 'grand_total']),
    createdByName: (() => {
      const n = pickStr(o, ['createdByName', 'created_by_name', 'CreatedByName']);
      return n ? inboundPerson(n) : undefined;
    })(),
    createdAt: pickStr(o, ['createdAt', 'created_at']) || undefined,
    updatedAt: pickStr(o, ['updatedAt', 'updated_at']) || undefined,
    quotationTemplate: normalizeQuotationTemplateType(
      pickStr(o, ['quotationTemplate', 'quotation_template', 'QuotationTemplate']),
    ),
  };
}

function mapCustomCharge(raw: unknown, index: number) {
  const o = asRecord(raw);
  return {
    id: pickNum(o, ['id', 'Id']) || undefined,
    sortIndex: pickNum(o, ['sortIndex', 'sort_index']) || index,
    chargeName: pickStr(o, ['chargeName', 'charge_name']),
    amount: pickNum(o, ['amount', 'Amount']),
  };
}

function readTermsFromJson(raw: unknown): QuotationTerm[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const o = asRecord(item);
        const title = pickStr(o, ['title', 'Title']).trim();
        const body = pickStr(o, ['body', 'Body', 'content', 'Content']).trim();
        if (!title && !body) return null;
        return { title, body };
      })
      .filter((t): t is QuotationTerm => t != null);
  } catch {
    return [];
  }
}

function mapTechnicalProposal(raw: unknown): TechnicalProposalPayload | null {
  if (raw == null) return null;
  const o = asRecord(raw);
  const currency = pickStr(o, ['currencyCode', 'currency_code', 'CurrencyCode']).trim() || 'INR';
  return {
    projectName: pickStr(o, ['projectName', 'project_name', 'ProjectName']),
    kindAttnDesignation: pickStr(o, [
      'kindAttnDesignation',
      'kind_attn_designation',
      'KindAttnDesignation',
    ]),
    commercialTerms: pickStr(o, ['commercialTerms', 'commercial_terms', 'CommercialTerms']),
    taxLabel: pickStr(o, ['taxLabel', 'tax_label', 'TaxLabel']),
    paymentTerms: pickStr(o, ['paymentTerms', 'payment_terms', 'PaymentTerms']),
    hsnCode: pickStr(o, ['hsnCode', 'hsn_code', 'HsnCode']),
    incoterms: pickStr(o, ['incoterms', 'Incoterms']),
    dispatchLeadTime: pickStr(o, ['dispatchLeadTime', 'dispatch_lead_time', 'DispatchLeadTime']),
    currencyCode: currency,
    proposalIntro: pickStr(o, ['proposalIntro', 'proposal_intro', 'ProposalIntro']),
    technicalSections: mapTerms(o['technicalSections'] ?? o['technical_sections'] ?? o['TechnicalSections']),
    commercialSections: mapTerms(
      o['commercialSections'] ?? o['commercial_sections'] ?? o['CommercialSections'],
    ),
  };
}

function mapTerms(raw: unknown): QuotationTerm[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        const o = asRecord(item);
        const title = pickStr(o, ['title', 'Title']).trim();
        const body = pickStr(o, ['body', 'Body', 'content', 'Content']).trim();
        if (!title && !body) return null;
        return { title, body };
      })
      .filter((t): t is QuotationTerm => t != null);
  }
  return readTermsFromJson(raw);
}

function mapLineItem(raw: unknown, index: number): QuotationLineItemDto {
  const o = asRecord(raw);
  const qty = pickNum(o, ['quantity', 'Quantity']) || 1;
  const rate = pickNum(o, ['rate', 'Rate']);
  const weight = pickNum(o, ['weight', 'Weight']);
  const unitWeight = pickNum(o, ['unitWeight', 'unit_weight']);
  const discountPercent = pickNum(o, ['discountPercent', 'discount_percent']);
  const gstPercent = pickNum(o, ['gstPercent', 'gst_percent']);
  const calc = recalcLineGroupValues({
    quantity: qty,
    rate,
    discountPercent,
    gstPercent,
    weight,
    unitWeight,
  });
  return {
    id: pickNum(o, ['id', 'Id']) || undefined,
    lineIndex: pickNum(o, ['lineIndex', 'line_index']) || index,
    itemId: pickNullableNum(o, ['itemId', 'item_id']),
    itemCode: pickStr(o, ['itemCode', 'item_code']),
    itemName: pickStr(o, ['itemName', 'item_name']),
    description: pickStr(o, ['description', 'Description']),
    quantity: qty,
    uom: pickStr(o, ['uom', 'Uom']),
    weight,
    unitWeight,
    steelRate: pickNum(o, ['steelRate', 'steel_rate']),
    rate,
    itemSnapshotJson: pickStr(o, ['itemSnapshotJson', 'item_snapshot_json']),
    discountPercent,
    gstPercent,
    amount: pickNum(o, ['amount', 'Amount']) || calc.amount,
    taxAmount: pickNum(o, ['taxAmount', 'tax_amount']) || calc.taxAmount,
    lineTotal: pickNum(o, ['lineTotal', 'line_total']) || calc.lineTotal,
  };
}

export function mapQuotationDetail(raw: unknown): QuotationUpsertDto {
  const o = asRecord(raw);
  const linesRaw = o['lineItems'] ?? o['line_items'] ?? o['LineItems'];
  const lines = Array.isArray(linesRaw)
    ? linesRaw.map((item, i) => mapLineItem(item, i))
    : [];
  const customRaw =
    o['customCharges'] ?? o['custom_charges'] ?? o['CustomCharges'] ?? o['additionalCharges'];
  const customCharges = Array.isArray(customRaw)
    ? customRaw.map((item, i) => mapCustomCharge(item, i))
    : [];

  let firstName = inboundPerson(pickStr(o, ['firstName', 'first_name']));
  let lastName = inboundPerson(pickStr(o, ['lastName', 'last_name']));
  const customerNameRaw = pickStr(o, ['customerName', 'customer_name']);
  if (!firstName && !lastName && customerNameRaw) {
    const parts = inboundPerson(customerNameRaw).split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ');
    } else {
      firstName = inboundPerson(customerNameRaw);
    }
  }

  const customerName =
    inboundPerson(customerNameRaw) || [firstName, lastName].filter(Boolean).join(' ');

  return {
    id: pickNum(o, ['id', 'Id']) || undefined,
    dealId: pickNullableNum(o, ['dealId', 'deal_id']),
    dealClosed: pickBool(o, ['dealClosed', 'deal_closed', 'DealClosed']),
    salutation: inboundPerson(pickStr(o, ['salutation', 'Salutation'])),
    firstName,
    lastName,
    gender: inboundGender(pickStr(o, ['gender', 'Gender'])),
    customerName,
    companyName: inboundCompany(pickStr(o, ['companyName', 'company_name'])),
    employees: pickStr(o, ['employees', 'Employees']),
    annualRevenue: pickNullableNum(o, ['annualRevenue', 'annual_revenue']),
    website: pickStr(o, ['website', 'Website']),
    gst: normalizeGstin(pickStr(o, ['gst', 'Gst'])),
    territory: pickStr(o, ['territory', 'Territory']),
    industry: pickStr(o, ['industry', 'Industry']),
    contactPerson: inboundPerson(pickStr(o, ['contactPerson', 'contact_person'])),
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
    subtotal: pickNum(o, ['subtotal', 'Subtotal']),
    taxTotal: pickNum(o, ['taxTotal', 'tax_total']),
    gstPercent: pickNum(o, ['gstPercent', 'gst_percent']),
    grandTotal: pickNum(o, ['grandTotal', 'grand_total']),
    totalQuantity: pickNum(o, ['totalQuantity', 'total_quantity']),
    totalWeight: pickNum(o, ['totalWeight', 'total_weight']),
    transportationCharges: pickNum(o, ['transportationCharges', 'transportation_charges']),
    loadingCharges: pickNum(o, ['loadingCharges', 'loading_charges']),
    serviceCharges: pickNum(o, ['serviceCharges', 'service_charges']),
    customizeTerms: pickBool(o, ['customizeTerms', 'customize_terms', 'CustomizeTerms']),
    introText: pickStr(o, ['introText', 'intro_text', 'IntroText']),
    transportationLabel: pickStr(o, ['transportationLabel', 'transportation_label', 'TransportationLabel']),
    jurisdiction: pickStr(o, ['jurisdiction', 'Jurisdiction']),
    terms: (() => {
      const fromArray = mapTerms(o['terms'] ?? o['Terms']);
      if (fromArray.length) return fromArray;
      return readTermsFromJson(o['termsConditionsJson'] ?? o['terms_conditions_json'] ?? o['TermsConditionsJson']);
    })(),
    customCharges,
    lineItems: lines,
    quotationTemplate: normalizeQuotationTemplateType(
      pickStr(o, ['quotationTemplate', 'quotation_template', 'QuotationTemplate']),
    ),
    technicalProposal: mapTechnicalProposal(
      o['technicalProposal'] ?? o['technical_proposal'] ?? o['TechnicalProposal'],
    ),
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

export function mapGridColumns(raw: unknown): QuotationGridColumnsDto {
  const o = asRecord(raw);
  const colsRaw = o['columns'] ?? o['Columns'];
  const columns: QuotationGridColumnDto[] = Array.isArray(colsRaw)
    ? colsRaw.map((c) => {
        const col = asRecord(c);
        return {
          key: pickStr(col, ['key', 'Key']),
          label: pickStr(col, ['label', 'Label']),
          visible: pickBoolOrDefault(col, ['visible', 'Visible'], true),
          order: pickNum(col, ['order', 'Order']),
          width: pickNum(col, ['width', 'Width']) || 100,
          editable: pickBoolOrDefault(col, ['editable', 'Editable'], true),
        };
      })
    : [];
  return { columns };
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
    gst: normalizeGstin(dto.gst),
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
    subtotal: dto.subtotal ?? 0,
    taxTotal: dto.taxTotal ?? 0,
    gstPercent: dto.gstPercent ?? 0,
    grandTotal: dto.grandTotal ?? 0,
    totalQuantity: dto.totalQuantity ?? 0,
    totalWeight: dto.totalWeight ?? 0,
    transportationCharges: dto.transportationCharges ?? 0,
    loadingCharges: dto.loadingCharges ?? 0,
    serviceCharges: dto.serviceCharges ?? 0,
    customizeTerms: dto.customizeTerms ?? false,
    introText: dto.introText ?? '',
    transportationLabel: dto.transportationLabel ?? '',
    jurisdiction: dto.jurisdiction ?? '',
    terms: (dto.terms ?? []).map((t) => ({ title: t.title, body: t.body })),
    customCharges: (dto.customCharges ?? []).map((c, i) => ({
      id: c.id ?? 0,
      sortIndex: c.sortIndex ?? i,
      chargeName: c.chargeName,
      amount: c.amount ?? 0,
    })),
    lineItems: dto.lineItems.map((l, i) => ({
      id: l.id ?? 0,
      lineIndex: l.lineIndex ?? i,
      itemId: l.itemId ?? null,
      itemCode: l.itemCode,
      itemName: l.itemName,
      description: l.description,
      quantity: l.quantity,
      uom: l.uom,
      weight: l.weight,
      unitWeight: l.unitWeight,
      steelRate: l.steelRate ?? 0,
      rate: l.rate,
      itemSnapshotJson: l.itemSnapshotJson ?? '',
      discountPercent: l.discountPercent,
      gstPercent: l.gstPercent,
      amount: l.amount,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
    })),
    quotationTemplate: dto.quotationTemplate ?? 'Standard',
    technicalProposal: dto.technicalProposal ?? null,
  };
}
