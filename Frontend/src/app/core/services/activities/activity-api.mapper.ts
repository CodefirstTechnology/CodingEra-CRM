import type { ActivityApiRecord, ActivityEntityType, ActivityGroup, ActivityRow } from './activity-api.models';

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function normalizeEntityType(raw: unknown): ActivityEntityType | string {
  const s = readString(raw).toLowerCase();
  if (s === 'lead' || s === 'deal' || s === 'contact' || s === 'organization') return s;
  return readString(raw);
}

export function extractActivityRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', 'activities', 'Activities']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function formatActivityWhen(iso: string | undefined | null): string {
  if (iso == null || !String(iso).trim()) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'Just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? '' : 's'} ago`;
  const year = Math.floor(month / 12);
  return `${year} year${year === 1 ? '' : 's'} ago`;
}

function activityIconKind(actionType: string): ActivityGroup['iconKind'] {
  const s = actionType.toLowerCase();
  if (s.includes('comment')) return 'comment';
  if (s.includes('note')) return 'edit';
  if (s.includes('task')) return 'edit';
  if (s.includes('attachment')) return 'edit';
  if (s.includes('creat')) return 'people';
  if (s.includes('convert')) return 'bolt';
  return 'edit';
}

export function mapActivityApiRecord(raw: unknown): ActivityRow | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = readOptionalInt(r['id'] ?? r['Id']);
  const entityId = readOptionalInt(r['entityId'] ?? r['EntityId']);
  if (id == null || entityId == null) return null;

  const createdAt = readString(r['createdAt'] ?? r['CreatedAt']) || new Date().toISOString();
  const actionType = readString(r['actionType'] ?? r['ActionType']) || 'updated';
  const message = readString(r['message'] ?? r['Message']);

  return {
    id,
    entityType: normalizeEntityType(r['entityType'] ?? r['EntityType']),
    entityId,
    actionType,
    actorUserId: readOptionalInt(r['actorUserId'] ?? r['ActorUserId']),
    actorName: readString(r['actorName'] ?? r['ActorName']) || 'Someone',
    message: message || `${actionType} on record`,
    fieldName: readString(r['fieldName'] ?? r['FieldName']) || null,
    oldValue: r['oldValue'] != null ? String(r['oldValue']) : r['OldValue'] != null ? String(r['OldValue']) : null,
    newValue: r['newValue'] != null ? String(r['newValue']) : r['NewValue'] != null ? String(r['NewValue']) : null,
    relatedRecordType: readString(r['relatedRecordType'] ?? r['RelatedRecordType']) || null,
    relatedRecordId: readOptionalInt(r['relatedRecordId'] ?? r['RelatedRecordId']),
    createdAt,
    whenLabel: formatActivityWhen(createdAt),
  };
}

function groupKey(row: ActivityRow): string {
  return `${row.createdAt}|${row.actorUserId ?? 'na'}|${row.entityType}|${row.entityId}`;
}

/** Groups field updates that share the same timestamp and actor (as returned by the CRM API). */
export function groupActivities(rows: ActivityRow[]): ActivityGroup[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const groups: ActivityGroup[] = [];

  for (const row of sorted) {
    const key = groupKey(row);
    const existing = groups.find((g) => g.id === key);
    if (existing) {
      existing.items.push(row);
      continue;
    }
    groups.push({
      id: key,
      actorName: row.actorName,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      whenLabel: row.whenLabel,
      items: [row],
      iconKind: activityIconKind(row.actionType),
    });
  }

  for (const g of groups) {
    if (g.items.length === 1) {
      g.iconKind = activityIconKind(g.items[0].actionType);
    } else {
      g.iconKind = 'edit';
    }
  }

  return groups;
}

export function mapActivityList(raw: unknown): ActivityRow[] {
  return extractActivityRecords(raw)
    .map((item) => mapActivityApiRecord(item))
    .filter((row): row is ActivityRow => row != null);
}

export function mapActivityGroups(raw: unknown): ActivityGroup[] {
  return groupActivities(mapActivityList(raw));
}
