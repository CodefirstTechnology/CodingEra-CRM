import type { TradeIndiaLeadInput, TradeIndiaLeadStatus } from './tradeindia-lead.model';
import { isTradeIndiaLeadStatus } from './tradeindia-lead.model';

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
 */
export function mapUnknownRecordToTradeIndiaLeadInput(value: unknown): TradeIndiaLeadInput | null {
  const row = asRecord(value);
  if (!row) return null;

  const customerName =
    pickString(row, [
      'name',
      'customerName',
      'customer_name',
      'customer',
      'contact_name',
      'buyer_name',
      'sender_name',
      'lead_name',
    ]) ?? '';
  const mobile =
    pickString(row, [
      'mobile',
      'phone',
      'Phone',
      'MOBILE',
      'contact_number',
      'phone_number',
      'mobile_number',
      'sender_mobile',
    ]) ?? '';
  const email = pickString(row, ['email', 'Email', 'EMAIL', 'buyer_email', 'sender_email']) ?? '';
  const city =
    pickString(row, [
      'city',
      'City',
      'location',
      'Location',
      'area',
      'locality',
      'customer_city',
      'sender_city',
    ]) ?? '';
  const requirement =
    pickString(row, [
      'requirement',
      'message',
      'Message',
      'query',
      'remarks',
      'comments',
      'description',
      'enquiry_text',
      'inquiry_text',
    ]) ?? '';
  const product =
    pickString(row, [
      'product',
      'Product',
      'product_name',
      'service',
      'Service',
      'category',
      'requirement_for',
      'subject',
    ]) ??
    (requirement.length > 0 ? requirement.slice(0, 120) : '');
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

  if (!customerName && !email && !mobile) return null;

  const input: TradeIndiaLeadInput = {
    customerName: customerName || email || mobile || 'Unknown',
    mobile: mobile || '-',
    email: email || '-',
    city: city || '-',
    product: product || '-',
    quantity,
    message: requirement || '-',
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
