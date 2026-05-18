import { normalizeOrganizationRow } from '../../../shared/utils/normalize-local-rows';
import type { OrganizationRow } from '../../../features/organizations/organizations.component';

function readOptionalInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readRefName(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v != null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o['name'] ?? '').trim();
  }
  return '';
}

export function normalizeOrganizationApiRecord(raw: unknown): OrganizationRow {
  const r = (raw != null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const industryRaw = r['industry'];
  const territoryRaw = r['territory'];
  const employeesRaw = r['employeeCount'] ?? r['employees'];

  return normalizeOrganizationRow({
    id: r['id'],
    name: r['name'] ?? r['organizationName'],
    website: r['website'],
    industry: readRefName(industryRaw) || industryRaw,
    annualRevenue: r['annualRevenue'],
    employees: readRefName(employeesRaw) || employeesRaw,
    territory: readRefName(territoryRaw) || territoryRaw,
    lastModified: r['lastModified'] ?? r['updatedAt'],
    address: r['address'],
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
}

/** Options passed when resolving/creating an organization from lead data (no required `name`). */
export type OrganizationEnsureOptions = Omit<OrganizationCreateInput, 'name'>;

/** JSON body for `POST /api/organizations` (Swagger-style flat DTO). */
export function organizationCreatePayload(input: OrganizationCreateInput): Record<string, unknown> {
  const name = input.name.trim();
  const body: Record<string, unknown> = {
    name,
    website: input.website?.trim() || '',
    annualRevenue: 0,
  };

  if (input.industryId != null && input.industryId > 0) {
    body['industryId'] = input.industryId;
  } else {
    body['industry'] = input.industry?.trim() || 'Other';
  }

  if (input.territoryId != null && input.territoryId > 0) {
    body['territoryId'] = input.territoryId;
  } else {
    const territory = input.territory?.trim();
    if (territory) body['territory'] = territory;
  }

  if (input.employeeCountId != null && input.employeeCountId > 0) {
    body['employeeCountId'] = input.employeeCountId;
  } else {
    body['employees'] = input.employees?.trim() || '1-10';
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
    } else if (options.industry?.trim()) {
      body['industry'] = options.industry.trim();
    }
    extras++;
  }

  const hasTerritory =
    (options.territoryId != null && options.territoryId > 0) ||
    (options.territory !== undefined && !!options.territory?.trim());
  if (hasTerritory) {
    if (options.territoryId != null && options.territoryId > 0) {
      body['territoryId'] = options.territoryId;
    } else if (options.territory?.trim()) {
      body['territory'] = options.territory.trim();
    }
    extras++;
  }

  const hasEmployees =
    (options.employeeCountId != null && options.employeeCountId > 0) ||
    (options.employees !== undefined && !!options.employees?.trim());
  if (hasEmployees) {
    if (options.employeeCountId != null && options.employeeCountId > 0) {
      body['employeeCountId'] = options.employeeCountId;
    } else if (options.employees?.trim()) {
      body['employees'] = options.employees.trim();
    }
    extras++;
  }

  return extras > 0 ? body : null;
}
