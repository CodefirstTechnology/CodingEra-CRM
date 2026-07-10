import { normalizeGstin } from '../../../shared/utils/gstin.util';
import { parseRevenueInputToNumber } from '../../../shared/utils/revenue-parse';
import type { LeadRow, LeadSource, LeadStatus } from '../../../features/leads/lead-row.model';
import { plainTextFromHtml } from '../../../shared/utils/plain-text-from-html';
import { resolveLeadStatusIdFromName } from './lead-status.constants';
import { applyMarketplaceNotesToLeadRow, extractMarketplaceExternalRef, parseMarketplaceNotesDisplay } from './marketplace-lead-to-api.mapper';
import {
  composeLeadNotesForApi,
  resolveLeadRequirementForDisplay,
} from './lead-notes-requirement.util';
import type { LeadNormalized, LeadUpsertDto } from './lead-api.models';

const LEAD_STATUS_BY_KEY: Record<string, LeadStatus> = {
  new: 'New',
  contacted: 'Contacted',
  nurture: 'Nurture',
  unqualified: 'Unqualified',
  qualified: 'Qualified',
  junk: 'Junk',
  lost: 'Lost',
  converted: 'Converted',
};

export function coerceLeadStatus(raw: string | undefined | null): LeadStatus {
  const key = (raw ?? 'New').trim().toLowerCase();
  return LEAD_STATUS_BY_KEY[key] ?? 'New';
}

function coerceLeadSource(raw: string | undefined | null): LeadSource {
  const s = (raw ?? 'Manual').trim();
  if (s === 'IndiaMART' || s === 'Justdial' || s === 'TradeIndia') return s;
  if (s === 'Excel') return 'Excel';
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
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    const fromCamel = String(o['name'] ?? '').trim();
    const fromPascal = String(o['Name'] ?? '').trim();
    if (fromCamel) return fromCamel;
    if (fromPascal) return fromPascal;
  }
  return '';
}

function readMasterId(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    const raw = o['id'] ?? o['Id'];
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number(raw.trim());
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
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
    'lead_owner_id',
    'Lead_Owner_Id',
    'lead_ownerId',
    'assignedToUserId',
    'AssignedToUserId',
    'assigned_to_user_id',
    'ownerId',
    'OwnerId',
    'owner_id',
    'assignedUserId',
    'assigned_user_id',
  ]) {
    const n = readOptionalInt(r[key]);
    if (n != null && n > 0) return n;
  }
  for (const [key, value] of Object.entries(r)) {
    if (/lead[_]?owner[_]?id/i.test(key)) {
      const n = readOptionalInt(value);
      if (n != null && n > 0) return n;
    }
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

/**
 * Reads the first usable timestamp string from payload keys (camel + Pascal-case .NET aliases).
 */
function readOptionalTimestamp(r: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      return new Date(v).toISOString();
    }
    const s = String(v).trim();
    if (!s || /^null$/i.test(s) || /^undefined$/i.test(s)) continue;
    return s;
  }
  return '';
}

/** Human-friendly “last updated” label for the leads table and detail UI. */
/** Local calendar date as `YYYY-MM-DD` (create form default). */
export function todayIsoDateLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Display label for {@link LeadRow.leadDate} in tables and detail. */
export function formatLeadDateDisplay(iso: string | undefined | null): string {
  const raw = iso?.trim();
  if (!raw || /^null$/i.test(raw) || /^undefined$/i.test(raw)) return '—';
  const datePart = raw.slice(0, 10);
  const t = Date.parse(datePart);
  if (Number.isNaN(t)) return raw;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(t);
  } catch {
    return datePart;
  }
}

export function leadDateToFormInput(iso: string | undefined | null): string {
  const raw = iso?.trim();
  if (!raw || /^null$/i.test(raw)) return '';
  return raw.slice(0, 10);
}

export function formatLeadUpdatedLabel(iso: string | undefined | null): string {
  if (iso == null) return '—';
  const raw = String(iso).trim();
  if (!raw || /^null$/i.test(raw) || /^undefined$/i.test(raw)) return '—';
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return '—';
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
  const lo = r['leadOwner'] ?? r['LeadOwner'];
  if (lo != null && typeof lo === 'object') {
    const o = lo as Record<string, unknown>;
    const nested =
      readMasterName(o) ||
      String(o['fullName'] ?? o['FullName'] ?? o['userName'] ?? o['UserName'] ?? '').trim();
    if (nested) return nested;
  }
  const direct = String(
    r['leadOwnerName'] ??
      r['LeadOwnerName'] ??
      r['ownerName'] ??
      r['OwnerName'] ??
      r['assignedTo'] ??
      '',
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
  const id = readOptionalInt(r['id']) ?? readOptionalInt(r['Id']) ?? 0;

  const firstName = String(r['firstName'] ?? r['FirstName'] ?? '').trim();
  const lastName = String(r['lastName'] ?? r['LastName'] ?? '').trim();

  const salutationId =
    readOptionalInt(r['salutationId']) ??
    readOptionalInt(r['SalutationId']) ??
    readMasterId(r['salutation']) ??
    readMasterId(r['Salutation']);
  const salutationName = readMasterName(r['salutation']) || readMasterName(r['Salutation']);

  const orgRaw = r['organization'] ?? r['Organization'];
  let organizationId =
    readOptionalInt(r['organizationId']) ??
    readOptionalInt(r['OrganizationId']) ??
    readOptionalInt(r['organization_id']) ??
    readOptionalInt(r['Organization_Id']);
  let organizationName =
    typeof orgRaw === 'string'
      ? orgRaw.trim()
      : String(r['organizationName'] ?? r['OrganizationName'] ?? '').trim();
  let industry = readMasterName(r['industry']) || readMasterName(r['Industry']);
  let territory = readMasterName(r['territory']) || readMasterName(r['Territory']);
  let employees = String(r['employees'] ?? r['Employees'] ?? '').trim();
  let annualRevenue = readOptionalInt(r['annualRevenue']) ?? readOptionalInt(r['AnnualRevenue']);
  let website = String(r['website'] ?? r['Website'] ?? '').trim();
  let gst = normalizeGstin(String(r['gst'] ?? r['Gst'] ?? ''));
  let territoryId =
    readOptionalInt(r['territoryId']) ??
    readOptionalInt(r['TerritoryId']);
  let employeeCountId =
    readOptionalInt(r['employeeCountId']) ??
    readOptionalInt(r['EmployeeCountId']);
  let industryId =
    readOptionalInt(r['industryId']) ??
    readOptionalInt(r['IndustryId']);

  if (orgRaw != null && typeof orgRaw === 'object') {
    const o = orgRaw as Record<string, unknown>;
    organizationId =
      organizationId ?? readOptionalInt(o['id']) ?? readOptionalInt(o['Id']);
    organizationName = String(o['name'] ?? o['Name'] ?? organizationName).trim();
    industry = readMasterName(o['industry']) || industry;
    territory = readMasterName(o['territory']) || territory;
    employees = readMasterName(o['employeeCount']) || employees;
    industryId = readOptionalInt(o['industryId']) ?? industryId ?? readMasterId(o['industry']);
    territoryId = readOptionalInt(o['territoryId']) ?? territoryId ?? readMasterId(o['territory']);
    employeeCountId =
      readOptionalInt(o['employeeCountId']) ?? employeeCountId ?? readMasterId(o['employeeCount']);
    const rev = o['annualRevenue'] ?? o['AnnualRevenue'];
    if (rev != null && Number.isFinite(Number(rev))) annualRevenue = Number(rev);
    website = String(o['website'] ?? website).trim();
    gst = normalizeGstin(String(o['gst'] ?? o['Gst'] ?? gst));
  }

  const leadStatusId =
    readOptionalInt(r['leadStatusId']) ??
    readOptionalInt(r['LeadStatusId']) ??
    readMasterId(r['leadStatus']) ??
    readMasterId(r['LeadStatus']);
  const statusName =
    readMasterName(r['leadStatus']) ||
    readMasterName(r['LeadStatus']) ||
    String(r['status'] ?? r['Status'] ?? 'New').trim() ||
    'New';

  const requestTypeId =
    readOptionalInt(r['requestTypeId']) ??
    readOptionalInt(r['RequestTypeId']) ??
    readMasterId(r['requestType']) ??
    readMasterId(r['RequestType']);
  const requestTypeName =
    readMasterName(r['requestType']) ||
    readMasterName(r['RequestType']) ||
    String(r['requestType'] ?? r['RequestType'] ?? '').trim();

  const createdIso = readOptionalTimestamp(r, [
    'createdAt',
    'CreatedAt',
    'createdDate',
    'CreatedDate',
    'creationTime',
    'CreationTime',
  ]);

  let updatedAt = readOptionalTimestamp(r, [
    'updatedAt',
    'UpdatedAt',
    'lastModified',
    'LastModified',
    'modifiedAt',
    'ModifiedAt',
    'modifyDate',
    'ModifyDate',
  ]);
  if (!updatedAt && createdIso) updatedAt = createdIso;

  const createdAt = createdIso !== '' ? createdIso : null;

  const location = String(
    r['location'] ?? r['Location'] ?? r['address'] ?? r['Address'] ?? '',
  ).trim();
  const leadDateRaw = readOptionalTimestamp(r, ['leadDate', 'LeadDate', 'lead_date']);
  const leadDate = leadDateRaw ? leadDateRaw.slice(0, 10) : '';

  const notesTrim = String(r['notes'] ?? r['Notes'] ?? '').trim();
  const marketplaceExt = extractMarketplaceExternalRef(notesTrim);
  const isIndiaMartMarketplaceLead = marketplaceExt?.source === 'IndiaMART';

  if (!isIndiaMartMarketplaceLead && !organizationName.trim()) {
    const fromNotes = parseMarketplaceNotesDisplay(notesTrim).organizationLabel?.trim();
    if (fromNotes) organizationName = fromNotes;
  }

  if (isIndiaMartMarketplaceLead && (organizationId == null || organizationId <= 0)) {
    organizationName = '';
  }

  return {
    id,
    firstName,
    lastName,
    salutationId,
    salutationName,
    gender: String(r['gender'] ?? r['Gender'] ?? '').trim(),
    mobile: String(r['mobile'] ?? r['Mobile'] ?? '').trim(),
    email: String(r['email'] ?? r['Email'] ?? '').trim(),
    organizationId,
    organizationName,
    industry,
    territory,
    employees,
    annualRevenue,
    website,
    gst,
    leadStatusId,
    statusName,
    requestTypeId,
    requestTypeName,
    notes: notesTrim,
    requirement: resolveLeadRequirementForDisplay(
      String(r['requirement'] ?? r['Requirement'] ?? ''),
      notesTrim,
    ),
    leadOwnerId: readLeadOwnerFk(r),
    leadOwnerName: readLeadOwnerDisplayName(r),
    leadSource: String(r['leadSource'] ?? r['source'] ?? r['Source'] ?? '').trim(),
    updatedAt,
    createdAt,
    territoryId,
    employeeCountId,
    industryId,
    location,
    leadDate,
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

  const displayIsoCreated = dto.createdAt?.trim() || dto.updatedAt?.trim() || null;
  const displayIsoUpdated = dto.updatedAt?.trim() || dto.createdAt?.trim() || null;
  const tsRaw = dto.updatedAt?.trim() || dto.createdAt?.trim() || '';
  const parsedSort = tsRaw ? Date.parse(tsRaw) : NaN;

  const status = coerceLeadStatus(dto.statusName);
  const statusIdFromName = resolveLeadStatusIdFromName(status);
  const apiStatusId = dto.leadStatusId != null && dto.leadStatusId > 0 ? dto.leadStatusId : undefined;
  /** Keep FK aligned with resolved status label when API FK drifts (common on marketplace imports). */
  const leadStatusId =
    statusIdFromName != null && statusIdFromName > 0
      ? apiStatusId != null && apiStatusId !== statusIdFromName
        ? statusIdFromName
        : (apiStatusId ?? statusIdFromName)
      : apiStatusId;

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
    organizationId:
      dto.organizationId != null && dto.organizationId > 0 ? String(dto.organizationId) : undefined,
    employees: dto.employees || undefined,
    annualRevenue: formatAnnualRevenueDisplay(dto.annualRevenue),
    website: dto.website || undefined,
    gst: normalizeGstin(dto.gst) || undefined,
    territory: dto.territory || undefined,
    industry: dto.industry || 'Other',
    status,
    requestType: dto.requestTypeName || undefined,
    salutationId: dto.salutationId != null && dto.salutationId > 0 ? dto.salutationId : undefined,
    requestTypeId: dto.requestTypeId != null && dto.requestTypeId > 0 ? dto.requestTypeId : undefined,
    territoryId: dto.territoryId != null && dto.territoryId > 0 ? dto.territoryId : undefined,
    employeeCountId: dto.employeeCountId != null && dto.employeeCountId > 0 ? dto.employeeCountId : undefined,
    industryId: dto.industryId != null && dto.industryId > 0 ? dto.industryId : undefined,
    leadStatusId,
    notes: dto.notes || undefined,
    requirement: dto.requirement || undefined,
    leadOwnerName:
      ownerNameFromApi || (leadOwnerId ? `User #${leadOwnerId}` : ''),
    owner: ownerNameFromApi ? initialsFromLeadOwnerName(ownerNameFromApi) : '',
    updated: formatLeadUpdatedLabel(displayIsoUpdated),
    created: formatLeadUpdatedLabel(displayIsoCreated),
    source: dto.leadSource || undefined,
    leadOwnerId,
    leadSource: resolveLeadSourceForRow(dto),
    sortTimestamp: !Number.isNaN(parsedSort) ? parsedSort : undefined,
    location: dto.location || undefined,
    leadDate: dto.leadDate || undefined,
  };

  return applyMarketplaceNotesToLeadRow(row, dto.notes);
}

/** @deprecated Use {@link mapLeadNormalizedToRow} after {@link normalizeLeadApiRecord}. */
export function mapLeadApiDtoToRow(dto: LeadNormalized): LeadRow {
  return mapLeadNormalizedToRow(dto);
}

export function mergeLeadPatch(row: LeadRow, patch: Partial<Omit<LeadRow, 'id'>>): LeadRow {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<Omit<LeadRow, 'id'>>;
  return { ...row, ...defined, id: row.id };
}

/** Strengthens PUT reconciliation when the API response omits nested organization / master labels. */
export function enrichLeadNormalizedFromPatch(
  baseline: LeadNormalized,
  patch: Partial<Omit<LeadRow, 'id'>>,
): LeadNormalized {
  return {
    ...baseline,
    organizationName:
      patch.organization !== undefined
        ? patch.organization.trim() || baseline.organizationName
        : baseline.organizationName,
    territory:
      patch.territory !== undefined ? patch.territory.trim() || baseline.territory : baseline.territory,
    territoryId: patch.territoryId !== undefined ? patch.territoryId ?? baseline.territoryId : baseline.territoryId,
    industry:
      patch.industry !== undefined ? patch.industry.trim() || baseline.industry : baseline.industry,
    industryId: patch.industryId !== undefined ? patch.industryId ?? baseline.industryId : baseline.industryId,
    website: patch.website !== undefined ? patch.website.trim() || baseline.website : baseline.website,
    gst: patch.gst !== undefined ? normalizeGstin(patch.gst) || baseline.gst : baseline.gst,
    employees:
      patch.employees !== undefined ? patch.employees.trim() || baseline.employees : baseline.employees,
    employeeCountId:
      patch.employeeCountId !== undefined
        ? patch.employeeCountId ?? baseline.employeeCountId
        : baseline.employeeCountId,
    salutationName:
      patch.salutation !== undefined
        ? patch.salutation.trim() || baseline.salutationName
        : baseline.salutationName,
    salutationId:
      patch.salutationId !== undefined ? patch.salutationId ?? baseline.salutationId : baseline.salutationId,
    leadStatusId:
      patch.leadStatusId !== undefined ? patch.leadStatusId ?? baseline.leadStatusId : baseline.leadStatusId,
    statusName:
      patch.status !== undefined ? String(patch.status).trim() || baseline.statusName : baseline.statusName,
  };
}

/** Non-empty patch string wins; `undefined` on a patch key does not clear the field. */
function coalesceStringAfterPut(
  fromApi: string | undefined | null,
  baseline: string | undefined | null,
  patch: Partial<Omit<LeadRow, 'id'>>,
  key: 'territory' | 'industry' | 'website' | 'employees' | 'salutation',
): string {
  if (key in patch && patch[key] !== undefined) {
    const trimmed = String(patch[key] ?? '').trim();
    if (trimmed) return trimmed;
  }
  return fromApi?.trim() || baseline?.trim() || '';
}

function coalesceFkAfterPut(
  fromApi: number | null | undefined,
  baseline: number | null | undefined,
  patch: Partial<Omit<LeadRow, 'id'>>,
  key: 'territoryId' | 'industryId' | 'employeeCountId' | 'salutationId' | 'leadStatusId',
): number | null {
  if (key in patch && patch[key] !== undefined && patch[key] != null) {
    const n = Number(patch[key]);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  if (fromApi != null && fromApi > 0) return fromApi;
  return baseline ?? null;
}

function normalizedToUpsertDto(n: LeadNormalized, idOverride?: number): LeadUpsertDto {
  const orgNm = n.organizationName?.trim();
  return {
    id: idOverride ?? n.id,
    firstName: n.firstName,
    lastName: n.lastName,
    salutationId: n.salutationId,
    gender: n.gender?.trim() || null,
    mobile: n.mobile || null,
    email: n.email || null,
    organizationId: n.organizationId,
    organizationName: orgNm || undefined,
    leadStatusId: n.leadStatusId,
    status: n.statusName || null,
    requestTypeId: n.requestTypeId,
    notes: n.notes || null,
    requirement: n.requirement || null,
    leadOwnerId: n.leadOwnerId,
    leadSource: n.leadSource || null,
    location: n.location?.trim() || null,
    leadDate: n.leadDate?.trim() || null,
    createdAt: n.createdAt,
  };
}

function resolveLeadOwnerIdForApi(row: LeadRow, previous?: LeadNormalized): number | null {
  if (row.leadOwnerId === '') return null;
  const parsed = parseLeadOwnerIdForApi(row.leadOwnerId);
  if (parsed != null) return parsed;
  return previous?.leadOwnerId ?? null;
}

function parseLeadRowOrganizationFk(id: string | undefined | null): number | null {
  if (id == null || !String(id).trim()) return null;
  const n = Number(String(id).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function rowToNormalized(row: LeadRow, previous?: LeadNormalized): LeadNormalized {
  const ownerId = resolveLeadOwnerIdForApi(row, previous);
  const orgFkFromRow = parseLeadRowOrganizationFk(row.organizationId);
  return {
    id: previous?.id ?? (Number.isFinite(Number(row.id)) ? Number(row.id) : 0),
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    salutationId: row.salutationId ?? previous?.salutationId ?? null,
    salutationName: row.salutation ?? previous?.salutationName ?? '',
    gender: row.gender?.trim() || previous?.gender?.trim() || '',
    mobile: row.mobile ?? '',
    email: row.email ?? '',
    organizationId: orgFkFromRow ?? previous?.organizationId ?? null,
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
    gst: normalizeGstin(row.gst ?? previous?.gst),
    leadStatusId: row.leadStatusId ?? previous?.leadStatusId ?? null,
    statusName: row.status ?? previous?.statusName ?? 'New',
    requestTypeId: row.requestTypeId ?? previous?.requestTypeId ?? null,
    requestTypeName: row.requestType ?? previous?.requestTypeName ?? '',
    notes:
      composeLeadNotesForApi(
        row.requirement ?? previous?.requirement,
        row.notes ?? previous?.notes,
      ) ||
      previous?.notes ||
      '',
    requirement:
      row.requirement?.trim() ||
      previous?.requirement?.trim() ||
      resolveLeadRequirementForDisplay(null, row.notes ?? previous?.notes),
    leadOwnerId: ownerId,
    leadOwnerName: row.leadOwnerName ?? previous?.leadOwnerName ?? '',
    leadSource: row.source ?? row.leadSource ?? previous?.leadSource ?? 'Manual',
    location: row.location?.trim() || previous?.location?.trim() || '',
    leadDate: row.leadDate?.trim() || previous?.leadDate?.trim() || '',
    updatedAt: previous?.updatedAt ?? new Date().toISOString(),
    createdAt: previous?.createdAt ?? null,
  };
}

/**
 * ASP.NET PUT responses often omit nested `organization` (and sparse master-data labels).
 * Raw normalization therefore drops organization / territory / industry that the UI just saved.
 * Prefer the API echo when present; otherwise use the PATCH and finally the merged baseline (`prevForMerge`).
 */
export function reconcileLeadNormalizedAfterPut(
  fromApi: LeadNormalized,
  baseline: LeadNormalized,
  patch: Partial<Omit<LeadRow, 'id'>>,
): LeadNormalized {
  const out = { ...fromApi };
  const clearedOrg =
    patch != null &&
    'organization' in patch &&
    patch.organization !== undefined &&
    !String(patch.organization).trim();
  if (clearedOrg) {
    out.organizationId = null;
    out.organizationName = '';
  } else {
    if ('organization' in patch && patch.organization !== undefined) {
      const fromPatch = patch.organization.trim();
      if (fromPatch) out.organizationName = fromPatch;
    }
    if (!out.organizationName?.trim()) {
      out.organizationName = fromApi.organizationName?.trim() || baseline.organizationName?.trim() || '';
    }
    out.organizationId =
      fromApi.organizationId != null && fromApi.organizationId > 0
        ? fromApi.organizationId
        : baseline.organizationId != null && baseline.organizationId > 0
          ? baseline.organizationId
          : null;
  }

  out.salutationName = coalesceStringAfterPut(
    fromApi.salutationName,
    baseline.salutationName,
    patch,
    'salutation',
  );
  out.salutationId = coalesceFkAfterPut(fromApi.salutationId, baseline.salutationId, patch, 'salutationId');

  out.territory = coalesceStringAfterPut(fromApi.territory, baseline.territory, patch, 'territory');
  out.territoryId = coalesceFkAfterPut(fromApi.territoryId, baseline.territoryId, patch, 'territoryId');

  out.industry = coalesceStringAfterPut(fromApi.industry, baseline.industry, patch, 'industry');
  out.industryId = coalesceFkAfterPut(fromApi.industryId, baseline.industryId, patch, 'industryId');

  out.website = coalesceStringAfterPut(fromApi.website, baseline.website, patch, 'website');
  out.employees = coalesceStringAfterPut(fromApi.employees, baseline.employees, patch, 'employees');
  out.employeeCountId = coalesceFkAfterPut(
    fromApi.employeeCountId,
    baseline.employeeCountId,
    patch,
    'employeeCountId',
  );

  out.leadStatusId = coalesceFkAfterPut(fromApi.leadStatusId, baseline.leadStatusId, patch, 'leadStatusId');
  if ('status' in patch && patch.status != null) {
    out.statusName = String(patch.status).trim() || out.statusName;
  } else if (!out.statusName?.trim()) {
    out.statusName = baseline.statusName?.trim() || fromApi.statusName?.trim() || 'New';
  }

  if (
    !(fromApi.annualRevenue != null && Number.isFinite(Number(fromApi.annualRevenue)))
  ) {
    const fromPatch =
      'annualRevenue' in patch ? parseAnnualRevenueForApi(patch.annualRevenue) : null;
    out.annualRevenue =
      fromPatch ?? (baseline.annualRevenue != null ? baseline.annualRevenue : null);
  }

  return out;
}

/** Keeps organization / territory / industry from the form when the PUT response is sparse. */
export function applyLeadRowOrgFieldsFromPatch(
  row: LeadRow,
  patch: Partial<Omit<LeadRow, 'id'>>,
): LeadRow {
  const out = { ...row };
  if (patch.organization !== undefined) {
    out.organization = patch.organization.trim();
  }
  if (patch.website !== undefined) {
    const w = patch.website.trim();
    out.website = w || undefined;
  }
  if (patch.gst !== undefined) {
    out.gst = normalizeGstin(patch.gst) || undefined;
  }
  if (patch.territory !== undefined) {
    const t = patch.territory.trim();
    out.territory = t || undefined;
  }
  if (patch.territoryId !== undefined) {
    out.territoryId = patch.territoryId ?? undefined;
  }
  if (patch.industry !== undefined) {
    const i = patch.industry.trim();
    out.industry = i || out.industry;
  }
  if (patch.industryId !== undefined) {
    out.industryId = patch.industryId ?? undefined;
  }
  if (patch.organizationId !== undefined) {
    out.organizationId = patch.organizationId;
  }
  return out;
}

export function mergeLeadApiDtoWithRowPatch(
  previous: LeadNormalized,
  patch: Partial<Omit<LeadRow, 'id'>>,
): LeadUpsertDto {
  const row = mergeLeadPatch(mapLeadNormalizedToRow(previous), patch);
  const merged = rowToNormalized(row, previous);
  if (patch.leadStatusId != null && patch.leadStatusId > 0) {
    merged.leadStatusId = patch.leadStatusId;
  }
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
