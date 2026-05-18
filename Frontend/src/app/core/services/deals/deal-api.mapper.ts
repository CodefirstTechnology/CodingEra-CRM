import type { DealPipelineStatus, DealRow } from '../../../features/deals/deals.component';
import type { DealNormalized, DealUpsertDto } from './deal-api.models';

const PIPELINE: DealPipelineStatus[] = [
  'Qualification',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
  'Demo/Making',
];

function coerceDealStatus(raw: string | undefined | null): DealPipelineStatus {
  const s = (raw ?? 'Qualification').trim();
  return (PIPELINE.includes(s as DealPipelineStatus) ? s : 'Qualification') as DealPipelineStatus;
}

function readMasterName(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v !== null && 'name' in v) {
    return String((v as { name?: unknown }).name ?? '').trim();
  }
  return '';
}

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Human-friendly label for the deals table (API sends ISO `lastModified`). */
export function formatDealLastModifiedLabel(iso: string | undefined | null): string {
  if (iso == null || String(iso).trim() === '') return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'Just now';
  if (diff < 86_400_000) return 'Today';
  if (diff < 172_800_000) return 'Yesterday';
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(t);
  } catch {
    return new Date(t).toLocaleString();
  }
}

export function parseOptionalPositiveInt(v: string | number | undefined | null): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Flattens nested `GET /api/deals` payloads into {@link DealNormalized}. */
export function normalizeDealApiRecord(raw: unknown): DealNormalized {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = readOptionalInt(r['id']) ?? 0;

  const orgRaw = r['organization'];
  let organizationId = readOptionalInt(r['organizationId']);
  let organizationName = String(r['organizationName'] ?? '').trim();
  let industry = readMasterName(r['industry']);
  let territory = readMasterName(r['territory']);
  let employees = String(r['employees'] ?? readMasterName(r['employeeCount'])).trim();
  let annualRevenue = readOptionalInt(r['annualRevenue']);
  let website = String(r['website'] ?? '').trim();

  if (orgRaw != null && typeof orgRaw === 'object') {
    const o = orgRaw as Record<string, unknown>;
    organizationId = organizationId ?? readOptionalInt(o['id']);
    organizationName = String(o['name'] ?? organizationName).trim();
    industry = readMasterName(o['industry']) || industry;
    territory = readMasterName(o['territory']) || territory;
    employees = readMasterName(o['employeeCount']) || employees;
    const rev = o['annualRevenue'];
    if (rev != null && Number.isFinite(Number(rev))) annualRevenue = Number(rev);
    website = String(o['website'] ?? website).trim();
  } else if (typeof orgRaw === 'string') {
    organizationName = orgRaw.trim();
  }

  const statusRaw = r['dealStatus'] ?? r['status'];
  const status =
    readMasterName(statusRaw) || (typeof statusRaw === 'string' ? statusRaw.trim() : 'Qualification');

  const prob = r['probabilityPercent'];
  const probabilityPercent =
    prob != null && Number.isFinite(Number(prob)) ? Number(prob) : null;

  return {
    id,
    organizationId,
    contactId: readOptionalInt(r['contactId']),
    organizationName,
    salutation: readMasterName(r['salutation']) || String(r['salutation'] ?? '').trim(),
    firstName: String(r['firstName'] ?? '').trim(),
    lastName: String(r['lastName'] ?? '').trim(),
    email: String(r['email'] ?? '').trim(),
    mobile: String(r['mobile'] ?? '').trim(),
    gender: String(r['gender'] ?? '').trim(),
    annualRevenue,
    employees: employees || '1-10',
    website,
    territory,
    industry: industry || 'Technology',
    status,
    dealOwnerId: readOptionalInt(r['dealOwnerId']),
    assignedToUserId: readOptionalInt(r['assignedToUserId']),
    assignedInitials: String(r['assignedInitials'] ?? '').trim(),
    relatedContactId: readOptionalInt(r['relatedContactId']),
    relatedOrganizationId: readOptionalInt(r['relatedOrganizationId']),
    probabilityPercent,
    nextStep: String(r['nextStep'] ?? '').trim(),
    lastModified: String(r['lastModified'] ?? r['updatedAt'] ?? '').trim(),
  };
}

export function mapDealNormalizedToRow(dto: DealNormalized): DealRow {
  const id = String(dto.id);
  const probabilityPercent = dto.probabilityPercent ?? 10;
  const assignedInitials = dto.assignedInitials ?? '';
  const assignedToUserId = dto.assignedToUserId ?? 0;
  const assignedTo =
    assignedToUserId > 0 && assignedInitials
      ? assignedInitials
      : assignedToUserId > 0
        ? `User #${assignedToUserId}`
        : assignedInitials;

  const out: DealRow = {
    id,
    organizationName: dto.organizationName ?? '',
    employees: dto.employees?.trim() ? dto.employees : '1-10',
    annualRevenue:
      dto.annualRevenue != null && Number.isFinite(dto.annualRevenue) ? dto.annualRevenue : 0,
    website: dto.website ?? '',
    territory: dto.territory ?? '',
    industry: dto.industry ?? 'Technology',
    salutation: dto.salutation ?? '',
    firstName: dto.firstName ?? '',
    lastName: dto.lastName ?? '',
    email: dto.email ?? '',
    mobile: dto.mobile ?? '',
    gender: dto.gender ?? '',
    status: coerceDealStatus(dto.status),
    dealOwnerId: dto.dealOwnerId != null && dto.dealOwnerId > 0 ? String(dto.dealOwnerId) : '',
    assignedTo,
    assignedInitials,
    lastModified: formatDealLastModifiedLabel(dto.lastModified),
    probabilityPercent,
    nextStep: dto.nextStep ?? '',
  };

  if (dto.relatedContactId != null && dto.relatedContactId > 0) {
    out.relatedContactId = String(dto.relatedContactId);
  }
  if (dto.relatedOrganizationId != null && dto.relatedOrganizationId > 0) {
    out.relatedOrganizationId = String(dto.relatedOrganizationId);
  }
  return out;
}

/** @deprecated Use {@link mapDealNormalizedToRow} after {@link normalizeDealApiRecord}. */
export function mapDealApiDtoToRow(dto: DealNormalized): DealRow {
  return mapDealNormalizedToRow(dto);
}

export function mergeDealRowPatch(row: DealRow, patch: Partial<Omit<DealRow, 'id'>>): DealRow {
  return { ...row, ...patch, id: row.id };
}

function parseOwnerIdFromRow(s: string | undefined | null, previous: number | null): number | null {
  if (s == null) return previous;
  const t = String(s).trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : previous;
}

function normalizedToUpsertDto(n: DealNormalized, idOverride?: number): DealUpsertDto {
  return {
    id: idOverride ?? n.id,
    organizationId: n.organizationId,
    contactId: n.contactId,
    organizationName: n.organizationName || null,
    salutation: n.salutation || null,
    firstName: n.firstName || null,
    lastName: n.lastName || null,
    email: n.email || null,
    mobile: n.mobile || null,
    gender: n.gender || null,
    annualRevenue: n.annualRevenue,
    employees: n.employees || null,
    website: n.website || null,
    territory: n.territory || null,
    industry: n.industry || null,
    status: n.status || null,
    dealOwnerId: n.dealOwnerId,
    assignedToUserId: n.assignedToUserId,
    assignedInitials: n.assignedInitials || null,
    relatedContactId: n.relatedContactId,
    relatedOrganizationId: n.relatedOrganizationId,
    probabilityPercent: n.probabilityPercent,
    nextStep: n.nextStep || null,
  };
}

function rowToNormalized(row: DealRow, previous?: DealNormalized): DealNormalized {
  const annual =
    Number.isFinite(row.annualRevenue) && row.annualRevenue !== 0 ? row.annualRevenue : null;
  return {
    id: previous?.id ?? (Number.isFinite(Number(row.id)) ? Number(row.id) : 0),
    organizationId: previous?.organizationId ?? null,
    contactId: previous?.contactId ?? null,
    organizationName: row.organizationName ?? '',
    salutation: row.salutation ?? '',
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    email: row.email === '—' ? '' : (row.email ?? ''),
    mobile: row.mobile === '—' ? '' : (row.mobile ?? ''),
    gender: row.gender ?? '',
    annualRevenue: annual ?? previous?.annualRevenue ?? null,
    employees: row.employees ?? previous?.employees ?? '1-10',
    website: row.website ?? previous?.website ?? '',
    territory: row.territory ?? previous?.territory ?? '',
    industry: row.industry ?? previous?.industry ?? 'Technology',
    status: row.status ?? previous?.status ?? 'Qualification',
    dealOwnerId: parseOwnerIdFromRow(row.dealOwnerId, previous?.dealOwnerId ?? null),
    assignedToUserId: previous?.assignedToUserId ?? null,
    assignedInitials: row.assignedInitials ?? previous?.assignedInitials ?? '',
    relatedContactId:
      parseOptionalPositiveInt(row.relatedContactId) ?? previous?.relatedContactId ?? null,
    relatedOrganizationId:
      parseOptionalPositiveInt(row.relatedOrganizationId) ??
      previous?.relatedOrganizationId ??
      null,
    probabilityPercent: row.probabilityPercent ?? previous?.probabilityPercent ?? 10,
    nextStep: row.nextStep ?? previous?.nextStep ?? '',
    lastModified: previous?.lastModified ?? new Date().toISOString(),
  };
}

export function mergeDealApiDtoWithRowPatch(
  previous: DealNormalized,
  patch: Partial<Omit<DealRow, 'id'>>,
): DealUpsertDto {
  const row = mergeDealRowPatch(mapDealNormalizedToRow(previous), patch);
  const merged = rowToNormalized(row, previous);
  const initials = (row.assignedInitials ?? '').trim();
  if (parseOwnerIdFromRow(row.dealOwnerId, null) == null && initials === '') {
    merged.assignedToUserId = null;
  }
  return normalizedToUpsertDto(merged, previous.id);
}

/** JSON body for `POST /api/deals`. */
export function dealCreatePayloadToApiJson(row: Omit<DealRow, 'id'>): DealUpsertDto {
  const synthetic: DealRow = { ...row, id: '0', lastModified: row.lastModified ?? '' };
  const normalized = rowToNormalized(synthetic);
  return normalizedToUpsertDto({ ...normalized, id: 0 }, 0);
}
