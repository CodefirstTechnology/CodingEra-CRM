import type { DealPipelineStatus, DealRow } from '../../../features/deals/deals.component';
import { DEFAULT_DEAL_PIPELINE_STATUS, resolveDealStatusLabel } from './deal-pipeline.constants';
import type { DealNormalized, DealUpsertDto } from './deal-api.models';
import { normalizeGstin } from '../../../shared/utils/gstin.util';

function coerceDealStatus(raw: string | undefined | null): DealPipelineStatus {
  return resolveDealStatusLabel(raw ?? DEFAULT_DEAL_PIPELINE_STATUS);
}

function readMasterId(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'object' && v !== null && 'id' in v) {
    return readOptionalInt((v as { id?: unknown }).id);
  }
  return null;
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

function readDealOwnerFk(r: Record<string, unknown>): number | null {
  for (const key of ['dealOwnerId', 'DealOwnerId', 'deal_owner_id', 'Deal_Owner_Id']) {
    const n = readOptionalInt(r[key]);
    if (n != null && n > 0) return n;
  }
  for (const [key, value] of Object.entries(r)) {
    if (/deal[_]?owner[_]?id/i.test(key)) {
      const n = readOptionalInt(value);
      if (n != null && n > 0) return n;
    }
  }
  return null;
}

function readUserFullName(v: unknown): string {
  if (v == null || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  return String(o['fullName'] ?? o['FullName'] ?? '').trim();
}

function readDealAssigneeDisplayName(r: Record<string, unknown>): string {
  for (const key of ['assignedToUser', 'AssignedToUser', 'dealOwner', 'DealOwner']) {
    const name = readUserFullName(r[key]);
    if (name) return name;
  }
  return '';
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readAssignedToUserFk(r: Record<string, unknown>): number | null {
  for (const key of [
    'assignedToUserId',
    'AssignedToUserId',
    'assigned_to_user_id',
    'Assigned_To_User_Id',
  ]) {
    const n = readOptionalInt(r[key]);
    if (n != null && n > 0) return n;
  }
  for (const [key, value] of Object.entries(r)) {
    if (/assigned[_]?to[_]?user[_]?id/i.test(key)) {
      const n = readOptionalInt(value);
      if (n != null && n > 0) return n;
    }
  }
  return null;
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
  let gst = normalizeGstin(String(r['gst'] ?? r['Gst'] ?? ''));

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
    gst = normalizeGstin(String(o['gst'] ?? o['Gst'] ?? gst));
  } else if (typeof orgRaw === 'string') {
    organizationName = orgRaw.trim();
  }

  const statusNav = r['dealStatus'];
  let dealStatusId =
    readOptionalInt(r['dealStatusId']) ?? readOptionalInt(r['DealStatusId']);
  let status = String(r['status'] ?? '').trim();

  if (statusNav != null && typeof statusNav === 'object') {
    const ds = statusNav as Record<string, unknown>;
    dealStatusId = readOptionalInt(ds['id']) ?? dealStatusId;
    const navName = readMasterName(ds);
    if (navName) status = navName;
  } else if (typeof statusNav === 'string' && statusNav.trim()) {
    status = statusNav.trim();
  }

  if (!status) {
    status = DEFAULT_DEAL_PIPELINE_STATUS;
  }

  const salutationId =
    readOptionalInt(r['salutationId']) ??
    readOptionalInt(r['SalutationId']) ??
    readMasterId(r['salutation']);
  const employeeCountId =
    readOptionalInt(r['employeeCountId']) ??
    readOptionalInt(r['EmployeeCountId']) ??
    readMasterId(r['employeeCount']) ??
    readMasterId(r['employees']);
  const territoryId =
    readOptionalInt(r['territoryId']) ??
    readOptionalInt(r['TerritoryId']) ??
    readMasterId(r['territory']);
  const industryId =
    readOptionalInt(r['industryId']) ??
    readOptionalInt(r['IndustryId']) ??
    readMasterId(r['industry']);
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
    gst,
    territory,
    industry: industry || 'Technology',
    status,
    dealOwnerId: readDealOwnerFk(r),
    assignedToUserId: readAssignedToUserFk(r),
    assignedToName: readDealAssigneeDisplayName(r),
    assignedInitials: String(r['assignedInitials'] ?? '').trim(),
    relatedContactId: readOptionalInt(r['relatedContactId']),
    relatedOrganizationId: readOptionalInt(r['relatedOrganizationId']),
    probabilityPercent,
    nextStep: String(r['nextStep'] ?? '').trim(),
    nextFollowUpDate: String(
      r['nextFollowUpDate'] ?? r['NextFollowUpDate'] ?? r['next_follow_up_date'] ?? '',
    ).trim() || undefined,
    lastModified: String(
      r['lastModified'] ??
        r['LastModified'] ??
        r['last_modified'] ??
        r['updatedAt'] ??
        r['UpdatedAt'] ??
        r['updated_at'] ??
        '',
    ).trim(),
    createdAt: String(
      r['createdAt'] ?? r['CreatedAt'] ?? r['created_at'] ?? '',
    ).trim(),
    salutationId,
    employeeCountId,
    territoryId,
    industryId,
    dealStatusId,
    lostReason: String(r['lostReason'] ?? r['LostReason'] ?? r['lost_reason'] ?? '').trim(),
  };
}

export function mapDealNormalizedToRow(dto: DealNormalized): DealRow {
  const id = String(dto.id);
  const probabilityPercent = dto.probabilityPercent ?? 10;
  const assignedToUserId = dto.assignedToUserId ?? 0;
  const ownerName = dto.assignedToName?.trim() ?? '';
  const assignedInitials =
    dto.assignedInitials?.trim() || (ownerName ? initialsFromDisplayName(ownerName) : '');
  const assignedTo =
    ownerName || (assignedToUserId > 0 ? `User #${assignedToUserId}` : assignedInitials);

  const out: DealRow = {
    id,
    organizationName: dto.organizationName ?? '',
    employees: dto.employees?.trim() ? dto.employees : '1-10',
    annualRevenue:
      dto.annualRevenue != null && Number.isFinite(dto.annualRevenue) ? dto.annualRevenue : 0,
    website: dto.website ?? '',
    gst: normalizeGstin(dto.gst),
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
    lastModifiedAt: dto.lastModified || undefined,
    createdAtAt: dto.createdAt || undefined,
    probabilityPercent,
    nextStep: dto.nextStep ?? '',
    lostReason: dto.lostReason?.trim() || undefined,
  };

  if (dto.nextFollowUpDate?.trim()) {
    out.nextFollowUpDate = dto.nextFollowUpDate.trim();
  }

  if (dto.relatedContactId != null && dto.relatedContactId > 0) {
    out.relatedContactId = String(dto.relatedContactId);
  }
  if (dto.organizationId != null && dto.organizationId > 0) {
    out.organizationId = String(dto.organizationId);
  }
  if (dto.relatedOrganizationId != null && dto.relatedOrganizationId > 0) {
    out.relatedOrganizationId = String(dto.relatedOrganizationId);
  } else if (dto.organizationId != null && dto.organizationId > 0) {
    out.relatedOrganizationId = String(dto.organizationId);
  }
  if (assignedToUserId > 0) {
    out.assignedToUserId = String(assignedToUserId);
  }
  if (dto.salutationId != null && dto.salutationId > 0) {
    out.salutationId = dto.salutationId;
  }
  if (dto.employeeCountId != null && dto.employeeCountId > 0) {
    out.employeeCountId = dto.employeeCountId;
  }
  if (dto.territoryId != null && dto.territoryId > 0) {
    out.territoryId = dto.territoryId;
  }
  if (dto.industryId != null && dto.industryId > 0) {
    out.industryId = dto.industryId;
  }
  if (dto.dealStatusId != null && dto.dealStatusId > 0) {
    out.dealStatusId = dto.dealStatusId;
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

function roundProbabilityPercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.trunc(Math.round(value));
}

function syncDealOwnerUserIds(
  dealOwnerId: number | null,
  assignedToUserId: number | null,
  clearWhenEmpty = false,
): { dealOwnerId: number | null; assignedToUserId: number | null } {
  const owner = dealOwnerId ?? assignedToUserId;
  if (owner != null && owner > 0) {
    return { dealOwnerId: owner, assignedToUserId: owner };
  }
  if (clearWhenEmpty) {
    return { dealOwnerId: null, assignedToUserId: null };
  }
  return { dealOwnerId, assignedToUserId };
}

function normalizedToUpsertDto(n: DealNormalized, idOverride?: number): DealUpsertDto {
  const owners = syncDealOwnerUserIds(n.dealOwnerId, n.assignedToUserId);
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
    gst: normalizeGstin(n.gst) || null,
    territory: n.territory || null,
    industry: n.industry || null,
    status: n.status || null,
    dealStatusId: n.dealStatusId != null && n.dealStatusId > 0 ? n.dealStatusId : undefined,
    dealOwnerId: owners.dealOwnerId,
    assignedToUserId: owners.assignedToUserId,
    assignedInitials: n.assignedInitials || null,
    relatedContactId: n.relatedContactId,
    relatedOrganizationId: n.relatedOrganizationId,
    probabilityPercent: roundProbabilityPercent(n.probabilityPercent),
    nextStep: n.nextStep?.trim() ?? '',
  };
}

function rowToNormalized(row: DealRow, previous?: DealNormalized): DealNormalized {
  const annual =
    Number.isFinite(row.annualRevenue) && row.annualRevenue !== 0 ? row.annualRevenue : null;
  const parsedOwner = parseOwnerIdFromRow(
    row.dealOwnerId,
    previous?.dealOwnerId ?? parseOwnerIdFromRow(row.assignedToUserId, null),
  );
  const parsedAssignee = parseOwnerIdFromRow(row.assignedToUserId, parsedOwner ?? previous?.assignedToUserId ?? null);
  const owners = syncDealOwnerUserIds(parsedOwner, parsedAssignee);
  return {
    id: previous?.id ?? (Number.isFinite(Number(row.id)) ? Number(row.id) : 0),
    organizationId:
      parseOptionalPositiveInt(row.organizationId) ?? previous?.organizationId ?? null,
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
    gst: normalizeGstin(row.gst ?? previous?.gst),
    territory: row.territory ?? previous?.territory ?? '',
    industry: row.industry ?? previous?.industry ?? 'Technology',
    status: row.status ?? previous?.status ?? DEFAULT_DEAL_PIPELINE_STATUS,
    dealStatusId:
      row.dealStatusId != null && row.dealStatusId > 0
        ? row.dealStatusId
        : previous?.dealStatusId ?? null,
    dealOwnerId: owners.dealOwnerId,
    assignedToUserId: owners.assignedToUserId,
    assignedInitials: row.assignedInitials ?? previous?.assignedInitials ?? '',
    relatedContactId:
      parseOptionalPositiveInt(row.relatedContactId) ?? previous?.relatedContactId ?? null,
    relatedOrganizationId:
      parseOptionalPositiveInt(row.relatedOrganizationId) ??
      parseOptionalPositiveInt(row.organizationId) ??
      previous?.relatedOrganizationId ??
      previous?.organizationId ??
      null,
    probabilityPercent:
      roundProbabilityPercent(row.probabilityPercent ?? previous?.probabilityPercent ?? 10) ?? 10,
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
  const ownerFromPatch = parseOwnerIdFromRow(row.dealOwnerId, null);
  const assigneeFromPatch = parseOwnerIdFromRow(row.assignedToUserId, ownerFromPatch);
  if (ownerFromPatch == null && assigneeFromPatch == null && initials === '') {
    merged.dealOwnerId = null;
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
