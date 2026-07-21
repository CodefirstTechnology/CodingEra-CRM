import { formatActivityWhen } from '../activities/activity-api.mapper';
import type { EmailDeliveryStatus, EntityEmailItem, EmailEntityType } from './email-api.models';
import { inboundPerson } from '../../../shared/utils/text-normalizer/inbound-format';

function formatSenderName(raw: string): string {
  const s = raw.trim();
  if (!s || /^User #\d+$/i.test(s)) return s;
  return inboundPerson(s) || s;
}

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function normalizeEntityType(raw: unknown): EmailEntityType {
  const s = readString(raw).toLowerCase();
  if (s === 'deal' || s === 'contact') return s;
  return 'lead';
}

function normalizeStatus(raw: unknown): EntityEmailItem['status'] {
  const s = readString(raw).toLowerCase();
  if (s === 'failed' || s === 'error') return 'Failed';
  if (s === 'draft') return 'Draft';
  return 'Sent';
}

export function extractEmailRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', 'emails', 'Emails']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function mapEmailApiRecord(raw: unknown, resolveSenderName?: (userId: number | null) => string): EntityEmailItem | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = readOptionalInt(r['id'] ?? r['Id']);
  const entityId = readOptionalInt(r['entityId'] ?? r['EntityId']);
  if (id == null || entityId == null) return null;

  const sentBy = readOptionalInt(r['sentBy'] ?? r['SentBy'] ?? r['sentByUserId'] ?? r['SentByUserId']);
  const fromEmail = readString(r['fromEmail'] ?? r['FromEmail']);
  const senderName = formatSenderName(
    readString(r['senderName'] ?? r['SenderName'] ?? r['sentByName'] ?? r['SentByName']) ||
      (resolveSenderName ? resolveSenderName(sentBy) : sentBy != null ? `User #${sentBy}` : 'User'),
  );
  const senderDisplay = fromEmail ? `${senderName} <${fromEmail}>` : senderName;
  const senderInitial = senderName.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || '?';

  const createdAt = readString(r['createdAt'] ?? r['CreatedAt']) || new Date().toISOString();
  const statusRaw = readString(r['status'] ?? r['Status']) as EmailDeliveryStatus;
  const failureMessage = readString(r['failureMessage'] ?? r['FailureMessage'] ?? r['errorMessage'] ?? r['ErrorMessage']);

  return {
    id: String(id),
    entityType: normalizeEntityType(r['entityType'] ?? r['EntityType']),
    entityId,
    senderDisplay,
    senderInitial,
    subjectLine: readString(r['subject'] ?? r['Subject']) || '(No subject)',
    toAddress: readString(r['toEmail'] ?? r['ToEmail'] ?? r['to'] ?? r['To']),
    status: normalizeStatus(statusRaw),
    whenLabel: formatActivityWhen(createdAt),
    body: readString(r['body'] ?? r['Body']) || '(No message body)',
    isHtml: Boolean(r['isHtml'] ?? r['IsHtml']),
    failureMessage: failureMessage || undefined,
    createdAt,
  };
}

export function mapEmailList(
  raw: unknown,
  resolveSenderName?: (userId: number | null) => string,
): EntityEmailItem[] {
  return extractEmailRecords(raw)
    .map((item) => mapEmailApiRecord(item, resolveSenderName))
    .filter((row): row is EntityEmailItem => row != null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Wrap plain text for HTML email when the compose box has no markup. */
export function prepareEmailBodyForApi(body: string, preferHtml: boolean): { body: string; isHtml: boolean } {
  const trimmed = body.trim();
  if (!preferHtml) return { body: trimmed, isHtml: false };
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return { body: trimmed, isHtml: true };
  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return { body: escaped, isHtml: true };
}
