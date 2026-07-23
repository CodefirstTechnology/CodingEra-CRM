import type { NoteRelatedType, NoteRow, NoteVisibility } from '../../../features/notes/notes.component';
import { formatActivityWhen } from '../activities/activity-api.mapper';
import {
  inboundDescription,
  inboundPerson,
  inboundTitle,
} from '../../../shared/utils/text-normalizer/inbound-format';

function formatDisplayPerson(raw: string): string {
  const s = raw.trim();
  if (!s || s === '—' || /^User #\d+$/i.test(s)) return s;
  return inboundPerson(s) || s;
}

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readAuthorUserId(r: Record<string, unknown>): number | null {
  for (const key of [
    'authorId',
    'AuthorId',
    'author_id',
    'authorUserId',
    'AuthorUserId',
    'createdByUserId',
    'CreatedByUserId',
    'createdBy',
    'CreatedBy',
    'created_by',
    'userId',
    'UserId',
  ]) {
    const n = readOptionalInt(r[key]);
    if (n != null && n > 0) return n;
  }
  const author = r['author'] ?? r['createdBy'];
  if (author != null && typeof author === 'object') {
    const n = readOptionalInt((author as Record<string, unknown>)['id']);
    if (n != null && n > 0) return n;
  }
  return null;
}

function readUpdatedByUserId(r: Record<string, unknown>): number | null {
  for (const key of [
    'updatedBy',
    'UpdatedBy',
    'updated_by',
    'updatedByUserId',
    'UpdatedByUserId',
  ]) {
    const n = readOptionalInt(r[key]);
    if (n != null && n > 0) return n;
  }
  const nested = r['updatedByUser'] ?? r['UpdatedByUser'];
  if (nested != null && typeof nested === 'object') {
    const n = readOptionalInt((nested as Record<string, unknown>)['id']);
    if (n != null && n > 0) return n;
  }
  return null;
}

function coerceRelatedType(raw: string | undefined | null): NoteRelatedType {
  const s = (raw ?? 'lead').trim().toLowerCase();
  if (s === 'deal' || s === 'contact' || s === 'organization') return s;
  return 'lead';
}

function coerceVisibility(raw: string | undefined | null): NoteVisibility {
  return (raw ?? 'team').trim().toLowerCase() === 'private' ? 'private' : 'team';
}

export function extractNoteRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', 'notes', 'Notes']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function mapNoteApiRecord(raw: unknown): NoteRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = String(readOptionalInt(r['id']) ?? r['id'] ?? '');
  const body = String(r['body'] ?? r['content'] ?? r['text'] ?? '').trim();
  const bodyPreview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  const authorUserId = readAuthorUserId(r);
  const updatedByUserId = readUpdatedByUserId(r) ?? authorUserId;
  let author = String(
    r['author'] ?? r['authorName'] ?? r['AuthorName'] ?? r['createdByName'] ?? r['CreatedByName'] ?? '',
  ).trim();
  if (!author && authorUserId != null) author = `User #${authorUserId}`;

  let assignedBy = String(
    r['assignedBy'] ??
      r['updatedByName'] ??
      r['UpdatedByName'] ??
      r['updatedByUserName'] ??
      '',
  ).trim();
  if (!assignedBy && updatedByUserId != null) assignedBy = `User #${updatedByUserId}`;

  const createdAt = String(r['createdAt'] ?? r['CreatedAt'] ?? r['lastModified'] ?? r['LastModified'] ?? '').trim();
  const whenRaw = String(r['when'] ?? r['When'] ?? '').trim();
  const when = whenRaw && whenRaw !== '—' && !whenRaw.includes('T')
    ? whenRaw
    : formatActivityWhen(createdAt || whenRaw || null);

  const relatedType = coerceRelatedType(String(r['relatedType'] ?? r['entityType'] ?? ''));
  const relatedLeadId =
    readOptionalInt(r['relatedLeadId'] ?? r['leadId']) != null
      ? String(readOptionalInt(r['relatedLeadId'] ?? r['leadId']))
      : undefined;
  const relatedDealId =
    readOptionalInt(r['relatedDealId'] ?? r['dealId']) != null
      ? String(readOptionalInt(r['relatedDealId'] ?? r['dealId']))
      : undefined;

  return {
    id,
    title: inboundTitle(String(r['title'] ?? r['subject'] ?? 'Note')) || 'Note',
    relatedType,
    relatedName: String(r['relatedName'] ?? r['entityName'] ?? '').trim() || '—',
    relatedId:
      readOptionalInt(r['relatedId'] ?? r['recordId']) != null
        ? String(readOptionalInt(r['relatedId'] ?? r['recordId']))
        : undefined,
    visibility: coerceVisibility(String(r['visibility'] ?? '')),
    body: inboundDescription(body),
    author: formatDisplayPerson(author || '—'),
    assignedBy: formatDisplayPerson(assignedBy || author || '—'),
    when,
    bodyPreview,
    bodyStorage: inboundDescription(body),
    relatedLeadId,
    relatedDealId,
    authorUserId:
      authorUserId != null && authorUserId > 0 ? String(authorUserId) : undefined,
    updatedByUserId:
      updatedByUserId != null && updatedByUserId > 0 ? String(updatedByUserId) : undefined,
  };
}

export interface NoteUpsertDto {
  id?: number;
  recordId: number;
  authorId?: number | null;
  title?: string | null;
  body?: string | null;
  relatedType?: string | null;
  relatedName?: string | null;
  visibility?: string | null;
  relatedLeadId?: number | null;
  relatedDealId?: number | null;
  relatedEntityId?: number | null;
  relatedContactId?: number | null;
  relatedOrganizationId?: number | null;
  status?: string | null;
  priority?: string | null;
}

export function noteRowToUpsertDto(data: Omit<NoteRow, 'id'>, id?: number): NoteUpsertDto {
  const leadId = data.relatedLeadId ? readOptionalInt(data.relatedLeadId) : null;
  const dealId = data.relatedDealId ? readOptionalInt(data.relatedDealId) : null;
  const relatedEntityId = dealId ?? leadId ?? readOptionalInt(data.relatedId);
  const recordId = relatedEntityId ?? 0;

  const authorId = data.authorUserId ? readOptionalInt(data.authorUserId) : null;

  return {
    id,
    recordId,
    authorId,
    title: data.title?.trim() || 'Note',
    body: data.body?.trim() || '',
    relatedType: data.relatedType,
    relatedName: data.relatedName?.trim() || '',
    visibility: data.visibility,
    relatedLeadId: leadId,
    relatedDealId: dealId,
    relatedEntityId,
    status: 'active',
    priority: 'medium',
  };
}
