import { parseRevenueInputToNumber } from '../../../shared/utils/revenue-parse';
import type { LeadRow, LeadSource, LeadStatus } from '../../../features/leads/lead-row.model';
import { applyMarketplaceNotesToLeadRow, extractMarketplaceExternalRef } from './marketplace-lead-to-api.mapper';
import type { LeadNormalized, LeadUpsertDto } from './lead-api.models';

const LEAD_STATUSES: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Lost', 'Converted'];

export function coerceLeadStatus(raw: string | undefined | null): LeadStatus {
  const s = (raw ?? 'New').trim();
  return (LEAD_STATUSES.includes(s as LeadStatus) ? s : 'New') as LeadStatus;
}

function coerceLeadSource(raw: string | undefined | null): LeadSource {
  const s = (raw ?? 'Manual').trim();
  if (s === 'IndiaMART' || s === 'Justdial' || s === 'TradeIndia') return s;
  return 'Manual';
}

function resolveLeadSourceForRow(n: LeadNormalized): LeadSource {
  const fromNotes = extractMarketplaceExternalRef(n.notes);
  if (fromNotes) return fromNotes.source;
  return coerceLeadSource(n.leadSource);
}

function readMasterName(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v !== null && 'name' in v) {
    return String((v as { name?: unknown }).name ?? '').trim();
  }
  return '';
}

function readMasterId(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'object' && v !== null && 'id' in v) {
    const id = (v as { id?: unknown }).id;
    return typeof id === 'number' && Number.isFinite(id) ? Math.trunc(id) : null;
  }
  return null;
}

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Resolves lead owner FK from flat or nested API shapes (list vs detail). */
function readLeadOwnerFk(r: Record<string, unknown>): number | null {
  for (const key of [
    'leadOwnerId',
    'LeadOwnerId',
    'assignedToUserId',
    'AssignedToUserId',
    'ownerId',
    'OwnerId',
    'assignedUserId',
  ]) {
    const n = readOptionalInt(r[key]);
    if (n != null && n > 0) return n;
  }
  for (const key of ['leadOwner', 'assignedTo', 'owner', 'AssignedTo']) {
    const nested = r[key];
    if (nested == null) continue;
    if (typeof nested === 'number' || typeof nested === 'string') {
      const n = readOptionalInt(nested);
      if (n != null && n > 0) return n;
      continue;
    }
    if (typeof nested === 'object') {
      const o = nested as Record<string, unknown>;
      const n = readOptionalInt(o['id'] ?? o['Id'] ?? o['userId'] ?? o['UserId']);
      if (n != null && n > 0) return n;
    }
  }
  return null;
}

/** Human-friendly “last updated” label for the leads table and detail UI. */
export function formatLeadUpdatedLabel(iso: string | undefined | null): string {
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

function formatAnnualRevenueDisplay(n: number | null | undefined): string | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  try {
    return `₹ ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
  } catch {
    return `₹ ${String(n)}`;
  }
}

function parseAnnualRevenueForApi(s: string | undefined | null): number | null {
  if (s == null || !String(s).trim()) return null;
  const n = parseRevenueInputToNumber(s);
  return Number.isFinite(n) ? n : null;
}

function readLeadOwnerDisplayName(r: Record<string, unknown>): string {
  const lo = r['leadOwner'];
  if (lo != null && typeof lo === 'object') {
    const o = lo as Record<string, unknown>;
    const nested =
      readMasterName(o) ||
      String(o['fullName'] ?? o['FullName'] ?? o['userName'] ?? o['UserName'] ?? '').trim();
    if (nested) return nested;
  }
  const direct = String(
    r['leadOwnerName'] ?? r['ownerName'] ?? r['assignedTo'] ?? '',
  ).trim();
  return direct;
}

function initialsFromLeadOwnerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseLeadOwnerIdForApi(leadOwnerId: string | undefined | null): number | null {
  if (leadOwnerId == null || !String(leadOwnerId).trim()) return null;
  const n = Number(String(leadOwnerId).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * Flattens nested `GET /api/leads` JSON (organization, leadStatus, salutation, …) into {@link LeadNormalized}.
 */
export function normalizeLeadApiRecord(raw: unknown): LeadNormalized {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = readOptionalInt(r['id']) ?? 0;

  const firstName = String(r['firstName'] ?? '').trim();
  const lastName = String(r['lastName'] ?? '').trim();

  const salutationId = readOptionalInt(r['salutationId']) ?? readMasterId(r['salutation']);
  const salutationName = readMasterName(r['salutation']);

  const orgRaw = r['organization'];
  let organizationId = readOptionalInt(r['organizationId']);
  let organizationName = typeof orgRaw === 'string' ? orgRaw.trim() : '';
  let industry = readMasterName(r['industry']);
  let territory = readMasterName(r['territory']);
  let employees = String(r['employees'] ?? '').trim();
  let annualRevenue = readOptionalInt(r['annualRevenue']);
  let website = String(r['website'] ?? '').trim();
  let territoryId = readOptionalInt(r['territoryId']);
  let employeeCountId = readOptionalInt(r['employeeCountId']);
  let industryId = readOptionalInt(r['industryId']);

  if (orgRaw != null && typeof orgRaw === 'object') {
    const o = orgRaw as Record<string, unknown>;
    organizationId = organizationId ?? readOptionalInt(o['id']);
    organizationName = String(o['name'] ?? organizationName).trim();
    industry = readMasterName(o['industry']) || industry;
    territory = readMasterName(o['territory']) || territory;
    employees = readMasterName(o['employeeCount']) || employees;
    industryId = readOptionalInt(o['industryId']) ?? industryId ?? readMasterId(o['industry']);
    territoryId = readOptionalInt(o['territoryId']) ?? territoryId ?? readMasterId(o['territory']);
    employeeCountId =
      readOptionalInt(o['employeeCountId']) ?? employeeCountId ?? readMasterId(o['employeeCount']);
    const rev = o['annualRevenue'];
    if (rev != null && Number.isFinite(Number(rev))) annualRevenue = Number(rev);
    website = String(o['website'] ?? website).trim();
  }

  const leadStatusId = readOptionalInt(r['leadStatusId']) ?? readMasterId(r['leadStatus']);
  const statusName =
    readMasterName(r['leadStatus']) || String(r['status'] ?? 'New').trim() || 'New';

  const requestTypeId = readOptionalInt(r['requestTypeId']) ?? readMasterId(r['requestType']);
  const requestTypeName = readMasterName(r['requestType']) || String(r['requestType'] ?? '').trim();

  const updatedAt = String(
    r['updatedAt'] ?? r['lastModified'] ?? r['UpdatedAt'] ?? '',
  ).trim();
  const createdAtRaw = r['createdAt'];
  const createdAt =
    createdAtRaw != null && String(createdAtRaw).trim() !== ''
      ? String(createdAtRaw).trim()
      : null;

  return {
    id,
    firstName,
    lastName,
    salutationId,
    salutationName,
    gender: String(r['gender'] ?? '').trim(),
    mobile: String(r['mobile'] ?? '').trim(),
    email: String(r['email'] ?? '').trim(),
    organizationId,
    organizationName,
    industry,
    territory,
    employees,
    annualRevenue,
    website,
    leadStatusId,
    statusName,
    requestTypeId,
    requestTypeName,
    notes: String(r['notes'] ?? '').trim(),
    leadOwnerId: readLeadOwnerFk(r),
    leadOwnerName: readLeadOwnerDisplayName(r),
    leadSource: String(r['leadSource'] ?? r['source'] ?? '').trim(),
    updatedAt,
    createdAt,
    territoryId,
    employeeCountId,
    industryId,
  };
}

export function mapLeadNormalizedToRow(dto: LeadNormalized): LeadRow {
  const id = String(dto.id);
  const name =
    [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() ||
    dto.organizationName ||
    'Lead';
  const leadOwnerId =
    dto.leadOwnerId != null && dto.leadOwnerId > 0 ? String(dto.leadOwnerId) : undefined;
  const ownerNameFromApi = dto.leadOwnerName?.trim() ?? '';

  const row: LeadRow = {
    id,
    name,
    firstName: dto.firstName,
    lastName: dto.lastName,
    salutation: dto.salutationName ? dto.salutationName : undefined,
    mobile: dto.mobile || undefined,
    gender: dto.gender || undefined,
    email: dto.email,
    organization: dto.organizationName,
    employees: dto.employees || undefined,
    annualRevenue: formatAnnualRevenueDisplay(dto.annualRevenue),
    website: dto.website || undefined,
    territory: dto.territory || undefined,
    industry: dto.industry || 'Other',
    status: coerceLeadStatus(dto.statusName),
    requestType: dto.requestTypeName || undefined,
    salutationId: dto.salutationId != null && dto.salutationId > 0 ? dto.salutationId : undefined,
    requestTypeId: dto.requestTypeId != null && dto.requestTypeId > 0 ? dto.requestTypeId : undefined,
    territoryId: dto.territoryId != null && dto.territoryId > 0 ? dto.territoryId : undefined,
    employeeCountId: dto.employeeCountId != null && dto.employeeCountId > 0 ? dto.employeeCountId : undefined,
    industryId: dto.industryId != null && dto.industryId > 0 ? dto.industryId : undefined,
    leadStatusId: dto.leadStatusId != null && dto.leadStatusId > 0 ? dto.leadStatusId : undefined,
    notes: dto.notes || undefined,
    leadOwnerName:
      ownerNameFromApi || (leadOwnerId ? `User #${leadOwnerId}` : ''),
    owner: ownerNameFromApi ? initialsFromLeadOwnerName(ownerNameFromApi) : '',
    updated: formatLeadUpdatedLabel(dto.updatedAt),
    source: dto.leadSource || undefined,
    leadOwnerId,
    leadSource: resolveLeadSourceForRow(dto),
    sortTimestamp: dto.updatedAt ? Date.parse(dto.updatedAt) || undefined : undefined,
  };

  return applyMarketplaceNotesToLeadRow(row, dto.notes);
}

/** @deprecated Use {@link mapLeadNormalizedToRow} after {@link normalizeLeadApiRecord}. */
export function mapLeadApiDtoToRow(dto: LeadNormalized): LeadRow {
  return mapLeadNormalizedToRow(dto);
}

export function mergeLeadPatch(row: LeadRow, patch: Partial<Omit<LeadRow, 'id'>>): LeadRow {
  return { ...row, ...patch, id: row.id };
}

function normalizedToUpsertDto(n: LeadNormalized, idOverride?: number): LeadUpsertDto {
  return {
    id: idOverride ?? n.id,
    firstName: n.firstName,
    lastName: n.lastName,
    salutationId: n.salutationId,
    gender: n.gender?.trim() || null,
    mobile: n.mobile || null,
    email: n.email || null,
    organizationId: n.organizationId,
    leadStatusId: n.leadStatusId,
    status: n.statusName || null,
    requestTypeId: n.requestTypeId,
    notes: n.notes || null,
    leadOwnerId: n.leadOwnerId,
    leadSource: n.leadSource || null,
    createdAt: n.createdAt,
  };
}

function resolveLeadOwnerIdForApi(row: LeadRow, previous?: LeadNormalized): number | null {
  if (row.leadOwnerId === '') return null;
  const parsed = parseLeadOwnerIdForApi(row.leadOwnerId);
  if (parsed != null) return parsed;
  return previous?.leadOwnerId ?? null;
}

function rowToNormalized(row: LeadRow, previous?: LeadNormalized): LeadNormalized {
  const ownerId = resolveLeadOwnerIdForApi(row, previous);
  return {
    id: previous?.id ?? (Number.isFinite(Number(row.id)) ? Number(row.id) : 0),
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    salutationId: row.salutationId ?? previous?.salutationId ?? null,
    salutationName: row.salutation ?? previous?.salutationName ?? '',
    gender: row.gender?.trim() || previous?.gender?.trim() || '',
    mobile: row.mobile ?? '',
    email: row.email ?? '',
    organizationId: previous?.organizationId ?? null,
    organizationName: row.organization ?? '',
    industry: row.industry ?? previous?.industry ?? '',
    industryId: row.industryId ?? previous?.industryId ?? null,
    territory: row.territory ?? previous?.territory ?? '',
    territoryId: row.territoryId ?? previous?.territoryId ?? null,
    employees: row.employees ?? previous?.employees ?? '',
    employeeCountId: row.employeeCountId ?? previous?.employeeCountId ?? null,
    annualRevenue:
      parseAnnualRevenueForApi(row.annualRevenue) ?? previous?.annualRevenue ?? null,
    website: row.website ?? previous?.website ?? '',
    leadStatusId: row.leadStatusId ?? previous?.leadStatusId ?? null,
    statusName: row.status ?? previous?.statusName ?? 'New',
    requestTypeId: row.requestTypeId ?? previous?.requestTypeId ?? null,
    requestTypeName: row.requestType ?? previous?.requestTypeName ?? '',
    notes: row.notes ?? previous?.notes ?? '',
    leadOwnerId: ownerId,
    leadOwnerName: row.leadOwnerName ?? previous?.leadOwnerName ?? '',
    leadSource: row.source ?? row.leadSource ?? previous?.leadSource ?? 'Manual',
    updatedAt: previous?.updatedAt ?? new Date().toISOString(),
    createdAt: previous?.createdAt ?? null,
  };
}

export function mergeLeadApiDtoWithRowPatch(
  previous: LeadNormalized,
  patch: Partial<Omit<LeadRow, 'id'>>,
): LeadUpsertDto {
  const row = mergeLeadPatch(mapLeadNormalizedToRow(previous), patch);
  const merged = rowToNormalized(row, previous);
  if (patch.status != null) {
    merged.statusName = patch.status;
  }
  return normalizedToUpsertDto(merged, previous.id);
}

/** JSON body for `POST /api/leads`. */
export function leadCreatePayloadToApiJson(row: Omit<LeadRow, 'id'>): LeadUpsertDto {
  const synthetic: LeadRow = {
    ...row,
    id: '0',
    updated: row.updated ?? 'Just now',
  };
  const normalized = rowToNormalized(synthetic);
  return normalizedToUpsertDto({ ...normalized, id: 0 }, 0);
}
