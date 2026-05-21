import { formatActivityWhen } from '../activities/activity-api.mapper';
import type { EntityCommentItem } from './comment-api.models';

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function extractCommentRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', 'comments', 'Comments']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function mapCommentApiRecord(
  raw: unknown,
  resolveAuthorName?: (authorId: number | null) => string,
): EntityCommentItem | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = readOptionalInt(r['id'] ?? r['Id']);
  const entityId = readOptionalInt(r['entityId'] ?? r['EntityId']);
  if (id == null || entityId == null) return null;

  const authorId = readOptionalInt(r['authorId'] ?? r['AuthorId'] ?? r['createdBy'] ?? r['CreatedBy']);
  const createdAt = readString(r['createdAt'] ?? r['CreatedAt']) || new Date().toISOString();
  const body = readString(r['body'] ?? r['Body']);
  const authorName =
    readString(r['authorName'] ?? r['AuthorName']) ||
    (resolveAuthorName ? resolveAuthorName(authorId) : authorId != null ? `User #${authorId}` : 'User');
  const initial = authorName.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || '?';

  return {
    id: String(id),
    authorId,
    authorName,
    authorInitial: initial,
    body,
    whenLabel: formatActivityWhen(createdAt),
    createdAt,
  };
}

export function mapCommentList(
  raw: unknown,
  resolveAuthorName?: (authorId: number | null) => string,
): EntityCommentItem[] {
  return extractCommentRecords(raw)
    .map((item) => mapCommentApiRecord(item, resolveAuthorName))
    .filter((row): row is EntityCommentItem => row != null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
