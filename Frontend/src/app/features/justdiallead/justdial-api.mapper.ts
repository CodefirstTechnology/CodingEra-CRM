import type { JustdialLeadInput, JustdialLeadStatus } from './justdial-lead.model';
import { isJustdialLeadStatus } from './justdial-lead.model';

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

/** Accepts common Justdial proxy response shapes (data, leads, enquiries, etc.). */
export function extractJustdialLeadsArrayFromApiResponse(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const root = asRecord(body);
  if (!root) return [];
  for (const key of [
    'leads',
    'data',
    'enquiries',
    'enquiry',
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

function mapStatus(raw: string | undefined): JustdialLeadStatus {
  if (raw && isJustdialLeadStatus(raw)) return raw;
  return 'New';
}

/**
 * Maps one loosely-typed Justdial API / webhook object into {@link JustdialLeadInput}.
 * Returns `null` when the object has no usable identity/contact fields.
 */
export function mapUnknownRecordToJustdialLeadInput(value: unknown): JustdialLeadInput | null {
  const row = asRecord(value);
  if (!row) return null;

  const customerName =
    pickString(row, [
      'name',
      'customerName',
      'customer_name',
      'customer',
      'contact_name',
      'caller_name',
      'buyer_name',
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
      'caller_number',
      'mobile_number',
    ]) ?? '';
  const email = pickString(row, ['email', 'Email', 'EMAIL', 'buyer_email', 'contact_email']) ?? '';
  const city =
    pickString(row, [
      'city',
      'City',
      'location',
      'Location',
      'area',
      'locality',
      'customer_city',
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
    ]) ?? '';
  const product =
    pickString(row, [
      'product',
      'Product',
      'service',
      'Service',
      'category',
      'business_category',
      'requirement_for',
      'subject',
    ]) ??
    (requirement.length > 0 ? requirement.slice(0, 120) : '');
  const quantity =
    pickString(row, ['quantity', 'Quantity', 'qty', 'QTY', 'units']) ??
    pickNumberString(row, ['quantity', 'qty', 'units']) ??
    '-';
  const source = pickString(row, ['source', 'Source', 'SOURCE', 'lead_source']) ?? 'Justdial';
  const createdAt = pickString(row, [
    'enquiry_time',
    'createdAt',
    'created_at',
    'created_on',
    'date',
    'lead_time',
    'query_time',
  ]);
  const externalRef = pickString(row, [
    'enquiry_id',
    'externalRef',
    'external_ref',
    'id',
    'lead_id',
    'LeadId',
    'jd_lead_id',
    'unique_id',
  ]);
  const statusRaw = pickString(row, ['status', 'STATUS', 'lead_status']);

  if (!customerName && !email && !mobile) return null;

  const input: JustdialLeadInput = {
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
export function mapUnknownJustdialWebhookPayloadToInput(payload: unknown): JustdialLeadInput | null {
  if (payload == null) return null;
  if (typeof payload === 'string') {
    try {
      return mapUnknownJustdialWebhookPayloadToInput(JSON.parse(payload) as unknown);
    } catch {
      return null;
    }
  }
  return mapUnknownRecordToJustdialLeadInput(payload);
}
