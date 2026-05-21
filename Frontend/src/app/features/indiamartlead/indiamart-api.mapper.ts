import { plainTextFromHtml } from '../../shared/utils/plain-text-from-html';
import type { IndiaMartLeadInput, IndiaMartLeadStatus } from './indiamart-lead.model';
import { isIndiaMartLeadStatus } from './indiamart-lead.model';

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
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Accepts IndiaMART CRM Pull API `{ RESPONSE: [...] }` and common shapes (data, leads, …).
 */
export function extractLeadsArrayFromApiResponse(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const root = asRecord(body);
  if (!root) return [];
  for (const key of ['RESPONSE', 'response', 'data', 'leads', 'items', 'result', 'records', 'rows']) {
    const v = root[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * IndiaMART CRM Pull returns JSON with `STATUS`, `CODE`, `MESSAGE` on failure.
 * Failures like 429 still include `RESPONSE: []` — must not treat that as “success, zero leads”.
 * `CODE` 204 = no leads in range (not an error for the UI). See official Pull API docs.
 */
export function getIndiaMartCrmPullErrorMessage(body: unknown): string | null {
  const root = asRecord(body);
  if (!root) return null;

  const status = root['STATUS'];
  const code = root['CODE'];
  const msg = typeof root['MESSAGE'] === 'string' ? root['MESSAGE'].trim() : '';

  if (status === 'FAILURE') {
    if (code === 204) return null;
    if (msg.length > 0) return msg;
    if (typeof code === 'number') return `IndiaMART Pull API failed (CODE ${code}).`;
  }

  return null;
}

function mapStatus(raw: string | undefined): IndiaMartLeadStatus {
  if (raw && isIndiaMartLeadStatus(raw)) return raw;
  return 'New';
}

/**
 * Maps one loosely-typed API / webhook object into {@link IndiaMartLeadInput}, or `null` if unusable.
 */
export function mapUnknownRecordToIndiaMartLeadInput(value: unknown): IndiaMartLeadInput | null {
  const row = asRecord(value);
  if (!row) return null;

  const customerName =
    pickString(row, [
      'SENDER_NAME',
      'customerName',
      'customer_name',
      'name',
      'buyer_name',
      'BuyerName',
    ]) ?? '';
  const mobile =
    pickString(row, [
      'SENDER_MOBILE',
      'mobile',
      'phone',
      'Phone',
      'MOBILE',
      'contact_number',
    ]) ?? '';
  const email =
    pickString(row, ['SENDER_EMAIL', 'email', 'Email', 'EMAIL', 'buyer_email']) ?? '';
  const city =
    pickString(row, ['city', 'City', 'LOCATION', 'SENDER_CITY', 'SENDER_COUNTRY_ISO']) ?? '';
  const queryMsg =
    pickString(row, ['QUERY_MESSAGE', 'query_message', 'message', 'Message']) ?? '';
  const product =
    pickString(row, [
      'product',
      'Product',
      'PRODUCT_NAME',
      'SUBJECT',
      'subject',
      'Query_Product',
    ]) ?? '';
  const quantity =
    pickString(row, ['quantity', 'Quantity', 'qty', 'QTY']) ??
    pickNumberString(row, ['quantity', 'Qty']) ??
    '—';
  const message = queryMsg || pickString(row, ['QUERY', 'remarks', 'Comments']) || '';
  const queryType = pickString(row, ['QUERY_TYPE', 'query_type']);
  const source =
    pickString(row, ['source', 'Source', 'SOURCE', 'lead_type']) ??
    (queryType ? `IndiaMART (${queryType})` : 'IndiaMART CRM Pull');
  const createdAt = pickString(row, [
    'createdAt',
    'created_at',
    'DATE_TIME',
    'QUERY_TIME',
    'query_time',
  ]);
  const externalRef = pickString(row, [
    'UNIQUE_QUERY_ID',
    'externalRef',
    'external_ref',
    'id',
    'UNIQUEID',
    'UNIQUE_ID',
    'lead_id',
    'LeadId',
  ]);
  const statusRaw = pickString(row, ['status', 'STATUS']);

  if (!customerName && !email && !mobile) return null;

  const input: IndiaMartLeadInput = {
    customerName: customerName || email || mobile || 'Unknown',
    mobile: mobile || '—',
    email: email || '—',
    city: city || '—',
    product: product || '—',
    quantity,
    message: plainTextFromHtml(message) || '—',
    source,
    status: mapStatus(statusRaw),
  };
  if (externalRef) input.externalRef = externalRef;
  if (createdAt) input.createdAt = createdAt;
  return input;
}

/** Maps webhook / callback JSON (object or stringified JSON) to an input. */
export function mapUnknownWebhookPayloadToInput(payload: unknown): IndiaMartLeadInput | null {
  if (payload == null) return null;
  if (typeof payload === 'string') {
    try {
      return mapUnknownWebhookPayloadToInput(JSON.parse(payload) as unknown);
    } catch {
      return null;
    }
  }
  return mapUnknownRecordToIndiaMartLeadInput(payload);
}
