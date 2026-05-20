import { normalizeOrganizationRow } from '../../../shared/utils/normalize-local-rows';
import type { OrganizationRow } from '../../../features/organizations/organizations.component';

function readOptionalInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Reads organization PK from POST/PUT JSON (camelCase or PascalCase). */
export function readOrganizationIdFromApiRaw(raw: unknown): number | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return (
    readOptionalInt(r['id']) ??
    readOptionalInt(r['Id']) ??
    readOptionalInt(r['organizationId']) ??
    readOptionalInt(r['OrganizationId'])
  );
}

function readRefName(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v != null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o['name'] ?? '').trim();
  }
  return '';
}

function readNestedRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function readOrganizationIndustryId(r: Record<string, unknown>): number | null {
  return (
    readOptionalInt(r['industryId']) ??
    readOptionalInt(r['IndustryId']) ??
    readOptionalInt(readNestedRecord(r['industry'])?.['id'])
  );
}

function readOrganizationEmployeeCountId(r: Record<string, unknown>): number | null {
  return (
    readOptionalInt(r['employeeCountId']) ??
    readOptionalInt(r['EmployeeCountId']) ??
    readOptionalInt(readNestedRecord(r['employeeCount'])?.['id'])
  );
}

function readOrganizationTerritoryId(r: Record<string, unknown>): number | null {
  return (
    readOptionalInt(r['territoryId']) ??
    readOptionalInt(r['TerritoryId']) ??
    readOptionalInt(readNestedRecord(r['territory'])?.['id'])
  );
}

export function normalizeOrganizationApiRecord(raw: unknown): OrganizationRow {
  const r = (raw != null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const industryRaw = r['industry'];
  const territoryRaw = r['territory'];
  const employeesRaw = r['employeeCount'] ?? r['employees'];

  const industryId = readOrganizationIndustryId(r);
  const employeeCountId = readOrganizationEmployeeCountId(r);
  const territoryId = readOrganizationTerritoryId(r);

  return normalizeOrganizationRow({
    id: r['id'] ?? r['Id'],
    name: r['name'] ?? r['Name'] ?? r['organizationName'],
    website: r['website'],
    industry:
      readRefName(industryRaw) || (typeof industryRaw === 'string' ? industryRaw.trim() : ''),
    annualRevenue: r['annualRevenue'],
    employees:
      readRefName(employeesRaw) || (typeof employeesRaw === 'string' ? employeesRaw.trim() : ''),
    territory:
      readRefName(territoryRaw) || (typeof territoryRaw === 'string' ? territoryRaw.trim() : ''),
    lastModified:
      r['lastModified'] ?? r['updatedAt'] ?? r['UpdatedAt'] ?? r['modifyDate'] ?? r['modifiedAt'],
    address: r['address'],
    industryId,
    employeeCountId,
    territoryId,
  });
}

export function organizationNumericId(row: OrganizationRow): number | null {
  return readOptionalInt(row.id);
}

export interface OrganizationCreateInput {
  name: string;
  territory?: string;
  territoryId?: number | null;
  industry?: string;
  industryId?: number | null;
  website?: string;
  employees?: string;
  employeeCountId?: number | null;
  /** Sent as `annualRevenue` on `OrganizationUpsertDto`; defaults to `0` when omitted. */
  annualRevenue?: number | null;
}

/** Options passed when resolving/creating an organization from lead data (no required `name`). */
export type OrganizationEnsureOptions = Omit<OrganizationCreateInput, 'name'>;

/** JSON body for `POST /api/organizations` (must match Swagger `OrganizationUpsertDto` — no extra keys). */
export function organizationCreatePayload(input: OrganizationCreateInput): Record<string, unknown> {
  const name = input.name.trim();
  const body: Record<string, unknown> = {
    name,
    website: input.website?.trim() ?? '',
    annualRevenue:
      input.annualRevenue != null && Number.isFinite(Number(input.annualRevenue))
        ? Number(input.annualRevenue)
        : 0,
  };

  if (input.industryId != null && input.industryId > 0) {
    body['industryId'] = input.industryId;
  }

  if (input.territoryId != null && input.territoryId > 0) {
    body['territoryId'] = input.territoryId;
  }

  if (input.employeeCountId != null && input.employeeCountId > 0) {
    body['employeeCountId'] = input.employeeCountId;
  }

  return body;
}

/**
 * Partial body for syncing org fields from a lead save when the organization already exists.
 * Only includes keys explicitly provided via options (avoids wiping unrelated columns on PUT).
 */
export function organizationLeadSyncPayload(
  orgName: string,
  options?: OrganizationEnsureOptions,
): Record<string, unknown> | null {
  if (!options) return null;
  const body: Record<string, unknown> = { name: orgName.trim() };
  let extras = 0;

  if (options.website !== undefined) {
    body['website'] = String(options.website).trim();
    extras++;
  }

  const hasIndustry =
    (options.industryId != null && options.industryId > 0) ||
    (options.industry !== undefined && !!options.industry?.trim());
  if (hasIndustry) {
    if (options.industryId != null && options.industryId > 0) {
      body['industryId'] = options.industryId;
      extras++;
    }
  }

  const hasTerritory =
    (options.territoryId != null && options.territoryId > 0) ||
    (options.territory !== undefined && !!options.territory?.trim());
  if (hasTerritory) {
    if (options.territoryId != null && options.territoryId > 0) {
      body['territoryId'] = options.territoryId;
      extras++;
    }
  }

  const hasEmployees =
    (options.employeeCountId != null && options.employeeCountId > 0) ||
    (options.employees !== undefined && !!options.employees?.trim());
  if (hasEmployees) {
    if (options.employeeCountId != null && options.employeeCountId > 0) {
      body['employeeCountId'] = options.employeeCountId;
      extras++;
    }
  }

  return extras > 0 ? body : null;
}

/**
 * Merges an existing organization row into a lead-sync PUT so omitted FKs are not cleared
 * when ASP.NET deserializes missing JSON properties as null.
 */
export function mergeOrganizationLeadSyncWithExisting(
  existing: OrganizationRow | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...patch };
  if (!existing) return body;

  if (!('territoryId' in body) && existing.territoryId != null && existing.territoryId > 0) {
    body['territoryId'] = existing.territoryId;
  }
  if (!('industryId' in body) && existing.industryId != null && existing.industryId > 0) {
    body['industryId'] = existing.industryId;
  }
  if (
    !('employeeCountId' in body) &&
    existing.employeeCountId != null &&
    existing.employeeCountId > 0
  ) {
    body['employeeCountId'] = existing.employeeCountId;
  }
  if (!('website' in body) && existing.website?.trim()) {
    body['website'] = existing.website.trim();
  }

  return body;
}
