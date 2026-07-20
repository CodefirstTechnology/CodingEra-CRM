import type { TradeIndiaLeadInput, TradeIndiaLeadStatus } from './tradeindia-lead.model';
import { isTradeIndiaLeadStatus } from './tradeindia-lead.model';
import {
  parseTradeIndiaInquiryMessage,
  resolveTradeIndiaCustomerName,
} from './tradeindia-inquiry-parse';

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function pickNumberString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Accepts common TradeIndia proxy response shapes (data, leads, enquiries, etc.). */
export function extractTradeIndiaLeadsArrayFromApiResponse(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const root = asRecord(body);
  if (!root) return [];
  for (const key of [
    'leads',
    'data',
    'enquiries',
    'enquiry',
    'inquiries',
    'items',
    'result',
    'records',
    'rows',
    'response',
    'RESPONSE',
  ]) {
    const v = root[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function mapStatus(raw: string | undefined): TradeIndiaLeadStatus {
  if (raw && isTradeIndiaLeadStatus(raw)) return raw;
  return 'New';
}

/**
 * Maps one loosely-typed TradeIndia API / webhook object into {@link TradeIndiaLeadInput}.
 * Returns `null` when the object has no usable identity/contact fields.
 *
 * Field mapping (TradeIndia My Inquiry API):
 * - sender_name → customerName
 * - sender_mobile → mobile
 * - sender_email → email
 * - sender_city → city
 * - sender_co → companyName (Organization)
 * - product_name → product (Requirement)
 * - message → message (notes / full inquiry; parsed when structured fields missing)
 * - rfi_id → externalRef
 */
export function mapUnknownRecordToTradeIndiaLeadInput(value: unknown): TradeIndiaLeadInput | null {
  const row = asRecord(value);
  if (!row) return null;

  const rawMessage =
    pickString(row, [
      'message',
      'Message',
      'MESSAGE',
      'inquiry_message',
      'enquiry_text',
      'inquiry_text',
      'requirement',
      'query',
      'remarks',
      'description',
    ]) ?? '';
  const parsed = parseTradeIndiaInquiryMessage(rawMessage);

  const customerName =
    pickString(row, [
      'sender_name',
      'SENDER_NAME',
      'name',
      'customerName',
      'customer_name',
      'customer',
      'contact_name',
      'buyer_name',
      'lead_name',
    ]) ?? '';
  const mobile =
    pickString(row, [
      'sender_mobile',
      'SENDER_MOBILE',
      'mobile',
      'phone',
      'Phone',
      'MOBILE',
      'contact_number',
      'phone_number',
      'mobile_number',
    ]) ??
    parsed.mobile ??
    '';
  const email =
    pickString(row, ['sender_email', 'SENDER_EMAIL', 'email', 'Email', 'EMAIL', 'buyer_email']) ?? '';
  const city =
    pickString(row, [
      'sender_city',
      'SENDER_CITY',
      'city',
      'City',
      'location',
      'Location',
      'area',
      'locality',
      'customer_city',
    ]) ??
    parsed.city ??
    '';
  const companyName =
    pickString(row, [
      'sender_co',
      'SENDER_CO',
      'company',
      'company_name',
      'Company Name',
      'CompanyName',
      'organization',
    ]) ??
    parsed.companyName ??
    '';
  const product =
    pickString(row, [
      'product_name',
      'PRODUCT_NAME',
      'product',
      'Product',
      'subject',
      'category',
      'service',
      'requirement_for',
    ]) ??
    parsed.product ??
    '';
  const quantity =
    pickString(row, ['quantity', 'Quantity', 'qty', 'QTY', 'units']) ??
    pickNumberString(row, ['quantity', 'qty', 'units']) ??
    '-';
  const source = pickString(row, ['source', 'Source', 'SOURCE', 'lead_source']) ?? 'TradeIndia';
  const createdAt = pickString(row, [
    'enquiry_time',
    'inquiry_time',
    'createdAt',
    'created_at',
    'created_on',
    'date',
    'lead_time',
    'query_time',
  ]);
  const externalRef = pickString(row, [
    'rfi_id',
    'RFI_ID',
    'enquiry_id',
    'inquiry_id',
    'externalRef',
    'external_ref',
    'id',
    'lead_id',
    'LeadId',
    'tradeindia_lead_id',
    'ti_lead_id',
    'unique_id',
  ]);
  const statusRaw = pickString(row, ['status', 'STATUS', 'lead_status']);

  if (!customerName && !email && !mobile && !companyName) return null;

  const input: TradeIndiaLeadInput = {
    // Never use mobile/email as Name — TradeIndia often omits sender_name.
    customerName: resolveTradeIndiaCustomerName({ senderName: customerName, companyName }),
    mobile: mobile || '-',
    email: email || '-',
    city: city || '-',
    companyName: companyName || '',
    product: product || '-',
    quantity,
    message: rawMessage || '-',
    source,
    status: mapStatus(statusRaw),
  };
  if (externalRef) input.externalRef = externalRef;
  if (createdAt) input.createdAt = createdAt;
  return input;
}

/** Maps webhook / callback JSON (object or stringified JSON) to an input. */
export function mapUnknownTradeIndiaWebhookPayloadToInput(
  payload: unknown,
): TradeIndiaLeadInput | null {
  if (payload == null) return null;
  if (typeof payload === 'string') {
    try {
      return mapUnknownTradeIndiaWebhookPayloadToInput(JSON.parse(payload) as unknown);
    } catch {
      return null;
    }
  }
  return mapUnknownRecordToTradeIndiaLeadInput(payload);
}
