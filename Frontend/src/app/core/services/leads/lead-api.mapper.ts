import { parseRevenueInputToNumber } from '../../../shared/utils/revenue-parse';
import type { LeadRow, LeadSource, LeadStatus } from '../../../features/leads/lead-row.model';
import type { LeadApiDto } from './lead-api.models';

const LEAD_STATUSES: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Lost', 'Converted'];

function coerceLeadStatus(raw: string | undefined | null): LeadStatus {
  const s = (raw ?? 'New').trim();
  return (LEAD_STATUSES.includes(s as LeadStatus) ? s : 'New') as LeadStatus;
}

function coerceLeadSource(raw: string | undefined | null): LeadSource {
  const s = (raw ?? 'Manual').trim();
  if (s === 'IndiaMART' || s === 'Justdial' || s === 'TradeIndia') return s;
  return 'Manual';
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

function parseLeadOwnerIdForApi(leadOwnerId: string | undefined | null): number | null {
  if (leadOwnerId == null || !String(leadOwnerId).trim()) return null;
  const n = Number(String(leadOwnerId).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function mapLeadApiDtoToRow(dto: LeadApiDto): LeadRow {
  const id = String(dto.id);
  const leadOwnerId =
    dto.leadOwnerId != null && Number.isFinite(dto.leadOwnerId)
      ? String(dto.leadOwnerId)
      : undefined;

  return {
    id,
    name: dto.name ?? '',
    firstName: dto.firstName ?? '',
    lastName: dto.lastName ?? '',
    salutation: dto.salutation?.trim() ? dto.salutation : undefined,
    mobile: dto.mobile?.trim() ? dto.mobile : undefined,
    gender: dto.gender?.trim() ? dto.gender : undefined,
    email: dto.email ?? '',
    organization: dto.organization ?? '',
    employees: dto.employees?.trim() ? dto.employees : undefined,
    annualRevenue: formatAnnualRevenueDisplay(dto.annualRevenue),
    website: dto.website?.trim() ? dto.website : undefined,
    territory: dto.territory?.trim() ? dto.territory : undefined,
    industry: dto.industry ?? '',
    jobTitle: dto.jobTitle?.trim() ? dto.jobTitle : undefined,
    status: coerceLeadStatus(dto.status),
    requestType: dto.requestType?.trim() ? dto.requestType : undefined,
    requirement: dto.message?.trim() ? dto.message : undefined,
    notes: dto.notes?.trim() ? dto.notes : undefined,
    leadOwnerName: dto.leadOwnerName ?? '',
    owner: dto.owner ?? '',
    updated: formatLeadUpdatedLabel(dto.updatedAt),
    source: dto.source?.trim() ? dto.source : undefined,
    leadOwnerId,
    leadSource: coerceLeadSource(dto.leadSource),
    sortTimestamp: dto.sortTimestamp ?? undefined,
  };
}

export function mergeLeadPatch(row: LeadRow, patch: Partial<Omit<LeadRow, 'id'>>): LeadRow {
  return { ...row, ...patch, id: row.id };
}

/**
 * Applies UI row patch onto the last known API DTO so PUT sends a full model without
 * wiping import-only fields (`externalRef`, `product`, etc.).
 */
export function mergeLeadApiDtoWithRowPatch(
  previous: LeadApiDto,
  patch: Partial<Omit<LeadRow, 'id'>>,
): LeadApiDto {
  const row = mergeLeadPatch(mapLeadApiDtoToRow(previous), patch);
  const ownerId = parseLeadOwnerIdForApi(row.leadOwnerId);
  return {
    ...previous,
    name: row.name ?? '',
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    salutation: row.salutation ?? '',
    gender: row.gender ?? '',
    mobile: row.mobile ?? '',
    email: row.email ?? '',
    organization: row.organization ?? '',
    employees: row.employees ?? '',
    annualRevenue: parseAnnualRevenueForApi(row.annualRevenue),
    website: row.website ?? '',
    territory: row.territory ?? '',
    industry: row.industry ?? '',
    jobTitle: row.jobTitle ?? '',
    status: row.status ?? 'New',
    requestType: row.requestType ?? '',
    notes: row.notes ?? '',
    source: row.source ?? '',
    leadOwnerName: row.leadOwnerName ?? '',
    owner: row.owner ?? '',
    leadOwnerId: ownerId ?? previous.leadOwnerId,
    leadSource: row.leadSource ?? previous.leadSource,
    sortTimestamp: row.sortTimestamp ?? previous.sortTimestamp,
    message: row.requirement?.trim() ? row.requirement : null,
  };
}

function rowToBaseApiFields(row: LeadRow): Omit<LeadApiDto, 'id' | 'updatedAt' | 'createdAt'> {
  return {
    name: row.name ?? '',
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    salutation: row.salutation ?? '',
    gender: row.gender ?? '',
    mobile: row.mobile ?? '',
    email: row.email ?? '',
    organization: row.organization ?? '',
    organizationId: null,
    employees: row.employees ?? '',
    annualRevenue: parseAnnualRevenueForApi(row.annualRevenue),
    website: row.website ?? '',
    territory: row.territory ?? '',
    industry: row.industry ?? '',
    jobTitle: row.jobTitle ?? '',
    status: row.status ?? 'New',
    requestType: row.requestType ?? '',
    notes: row.notes ?? '',
    source: row.source ?? '',
    leadOwnerName: row.leadOwnerName ?? '',
    owner: row.owner ?? '',
    leadOwnerId: parseLeadOwnerIdForApi(row.leadOwnerId),
    leadSource: row.leadSource ?? 'Manual',
    sortTimestamp: row.sortTimestamp ?? null,
    externalRef: null,
    product: null,
    quantity: null,
    message: row.requirement?.trim() ? row.requirement : null,
    city: null,
  };
}

/** JSON body for POST /api/leads. */
export function leadCreatePayloadToApiJson(row: Omit<LeadRow, 'id'>): LeadApiDto {
  const synthetic: LeadRow = {
    ...row,
    id: '0',
    updated: row.updated ?? 'Just now',
  };
  const base = rowToBaseApiFields(synthetic);
  return {
    id: 0,
    ...base,
    updatedAt: new Date().toISOString(),
    createdAt: null,
  };
}
