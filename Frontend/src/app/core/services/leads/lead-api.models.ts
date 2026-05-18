/** Master-data node returned inline on GET (salutation, leadStatus, industry, …). */
export interface MasterDataRef {
  id: number;
  name?: string | null;
  description?: string | null;
  isActive?: boolean;
  lastModified?: string | null;
}

/** Organization summary on GET /api/leads. */
export interface LeadOrganizationRef {
  id: number;
  name?: string | null;
  website?: string | null;
  annualRevenue?: number | null;
  industry?: MasterDataRef | string | null;
  employeeCount?: MasterDataRef | string | null;
  territory?: MasterDataRef | string | null;
  industryId?: number | null;
  employeeCountId?: number | null;
  territoryId?: number | null;
  lastModified?: string | null;
}

/**
 * Normalized lead record used inside the app after `GET` (flat fields + FK ids for round-trip).
 */
export interface LeadNormalized {
  id: number;
  firstName: string;
  lastName: string;
  salutationId: number | null;
  salutationName: string;
  gender: string;
  mobile: string;
  email: string;
  organizationId: number | null;
  organizationName: string;
  industry: string;
  territory: string;
  employees: string;
  annualRevenue: number | null;
  website: string;
  leadStatusId: number | null;
  statusName: string;
  requestTypeId: number | null;
  requestTypeName: string;
  notes: string;
  leadOwnerId: number | null;
  /** Display name when returned inline on GET (otherwise resolved from users list). */
  leadOwnerName: string;
  leadSource: string;
  updatedAt: string;
  createdAt: string | null;
  /** From nested organization on GET, for master-data dropdown round-trip. */
  territoryId: number | null;
  employeeCountId: number | null;
  industryId: number | null;
}

/** Body for `POST` / `PUT /api/leads` per Swagger `LeadUpsertDto`. */
export interface LeadUpsertDto {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  salutationId?: number | null;
  gender?: string | null;
  mobile?: string | null;
  email?: string | null;
  organizationId?: number | null;
  leadStatusId?: number | null;
  status?: string | null;
  requestTypeId?: number | null;
  notes?: string | null;
  leadOwnerId?: number | null;
  leadSource?: string | null;
  createdAt?: string | null;
}

/** @deprecated Use {@link LeadNormalized} for reads and {@link LeadUpsertDto} for writes. */
export type LeadApiDto = LeadNormalized;
