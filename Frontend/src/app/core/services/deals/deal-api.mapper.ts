import type { DealPipelineStatus, DealRow } from '../../../features/deals/deals.component';
import type { DealApiDto } from './deal-api.models';

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

export function parseOptionalPositiveInt(v: string | number | undefined | null): number {
  if (v == null || String(v).trim() === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Maps UI `dealOwnerId` (numeric string or initials) onto API ints; preserves `previous` when the UI value is non-numeric. */
function parseOwnerIdFromRow(s: string | undefined | null, previous: number): number {
  if (s == null) return previous;
  const t = String(s).trim();
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : previous;
}

export function mapDealApiDtoToRow(dto: DealApiDto): DealRow {
  const id = String(dto.id);
  const emailRaw = dto.email?.trim() ?? '';
  const mobileRaw = dto.mobile?.trim() ?? '';
  const prob = dto.probabilityPercent;
  const probabilityPercent =
    prob != null && Number.isFinite(Number(prob)) ? Number(prob) : 10;

  const assignedInitials = dto.assignedInitials?.trim() ?? '';
  const assignedTo =
    dto.assignedToUserId > 0 && assignedInitials
      ? assignedInitials
      : dto.assignedToUserId > 0
        ? `User #${dto.assignedToUserId}`
        : assignedInitials;

  const out: DealRow = {
    id,
    organizationName: dto.organizationName ?? '',
    employees: dto.employees?.trim() ? dto.employees : '1-10',
    annualRevenue: Number.isFinite(Number(dto.annualRevenue)) ? Number(dto.annualRevenue) : 0,
    website: dto.website?.trim() ? dto.website : '',
    territory: dto.territory?.trim() ? dto.territory : '',
    industry: dto.industry?.trim() ? dto.industry : 'Technology',
    salutation: dto.salutation?.trim() ? dto.salutation : '',
    firstName: dto.firstName?.trim() ? dto.firstName : '',
    lastName: dto.lastName?.trim() ? dto.lastName : '',
    email: emailRaw,
    mobile: mobileRaw,
    gender: dto.gender?.trim() ? dto.gender : '',
    status: coerceDealStatus(dto.status),
    dealOwnerId: dto.dealOwnerId > 0 ? String(dto.dealOwnerId) : '',
    assignedTo,
    assignedInitials,
    lastModified: formatDealLastModifiedLabel(dto.lastModified),
    probabilityPercent,
    nextStep: dto.nextStep?.trim() ? dto.nextStep : '',
  };

  if (dto.relatedContactId > 0) {
    out.relatedContactId = String(dto.relatedContactId);
  }
  if (dto.relatedOrganizationId > 0) {
    out.relatedOrganizationId = String(dto.relatedOrganizationId);
  }
  return out;
}

export function mergeDealRowPatch(row: DealRow, patch: Partial<Omit<DealRow, 'id'>>): DealRow {
  return { ...row, ...patch, id: row.id };
}

/**
 * Merges a UI patch onto the last known API DTO so PUT sends a full model without
 * dropping server-only ids (`organizationId`, `contactId`, `assignedToUserId`, …).
 */
export function mergeDealApiDtoWithRowPatch(
  previous: DealApiDto,
  patch: Partial<Omit<DealRow, 'id'>>,
): DealApiDto {
  const row = mergeDealRowPatch(mapDealApiDtoToRow(previous), patch);
  const prob = row.probabilityPercent ?? 10;
  const emailForApi = row.email === '—' ? '' : (row.email ?? '');
  const mobileForApi = row.mobile === '—' ? '' : (row.mobile ?? '');
  const nextDealOwnerId = parseOwnerIdFromRow(row.dealOwnerId, previous.dealOwnerId);
  const initials = (row.assignedInitials ?? '').trim();
  const assignedToUserId =
    nextDealOwnerId === 0 && initials === '' ? 0 : previous.assignedToUserId;

  return {
    ...previous,
    organizationName: row.organizationName ?? previous.organizationName,
    salutation: row.salutation ?? '',
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    email: emailForApi,
    mobile: mobileForApi,
    gender: row.gender ?? '',
    annualRevenue: Number.isFinite(row.annualRevenue) ? row.annualRevenue : 0,
    employees: row.employees ?? '',
    website: row.website ?? '',
    territory: row.territory ?? '',
    industry: row.industry ?? '',
    status: row.status ?? 'Qualification',
    dealOwnerId: nextDealOwnerId,
    assignedToUserId,
    assignedInitials: row.assignedInitials ?? '',
    relatedContactId: parseOptionalPositiveInt(row.relatedContactId) || previous.relatedContactId,
    relatedOrganizationId:
      parseOptionalPositiveInt(row.relatedOrganizationId) || previous.relatedOrganizationId,
    probabilityPercent: Number.isFinite(prob) ? prob : 10,
    nextStep: row.nextStep ?? '',
    lastModified: new Date().toISOString(),
  };
}

/** JSON body for `POST /api/deals` (server assigns `id`). */
export function dealCreatePayloadToApiJson(row: Omit<DealRow, 'id'>): DealApiDto {
  return {
    id: 0,
    organizationId: 0,
    contactId: 0,
    organizationName: row.organizationName ?? '',
    salutation: row.salutation ?? '',
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    email: row.email ?? '',
    mobile: row.mobile ?? '',
    gender: row.gender ?? '',
    annualRevenue: Number.isFinite(row.annualRevenue) ? row.annualRevenue : 0,
    employees: row.employees ?? '',
    website: row.website ?? '',
    territory: row.territory ?? '',
    industry: row.industry ?? '',
    status: row.status ?? 'Qualification',
    dealOwnerId: parseOptionalPositiveInt(row.dealOwnerId),
    assignedToUserId: 0,
    assignedInitials: row.assignedInitials ?? '',
    relatedContactId: parseOptionalPositiveInt(row.relatedContactId),
    relatedOrganizationId: parseOptionalPositiveInt(row.relatedOrganizationId),
    probabilityPercent: row.probabilityPercent ?? 10,
    nextStep: row.nextStep ?? '',
    lastModified: new Date().toISOString(),
  };
}
