/** Flattened deal used after `GET /api/deals` (supports nested organization/industry on read). */
export interface DealNormalized {
  id: number;
  organizationId: number | null;
  contactId: number | null;
  organizationName: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  gender: string;
  annualRevenue: number | null;
  employees: string;
  website: string;
  gst?: string;
  territory: string;
  industry: string;
  status: string;
  dealOwnerId: number | null;
  assignedToUserId: number | null;
  assignedInitials: string;
  relatedContactId: number | null;
  relatedOrganizationId: number | null;
  probabilityPercent: number | null;
  nextStep: string;
  nextFollowUpDate?: string | null;
  /** ISO timestamp from API (`last_modified` / `updated_at`). */
  lastModified: string;
  /** ISO timestamp from API (`created_at`). */
  createdAt?: string;
  salutationId?: number | null;
  employeeCountId?: number | null;
  territoryId?: number | null;
  industryId?: number | null;
  dealStatusId?: number | null;
}

/** Body for `POST` / `PUT /api/deals` per Swagger `DealUpsertDto`. */
export interface DealUpsertDto {
  id: number;
  organizationId?: number | null;
  contactId?: number | null;
  organizationName?: string | null;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  gender?: string | null;
  annualRevenue?: number | null;
  employees?: string | null;
  website?: string | null;
  gst?: string | null;
  territory?: string | null;
  industry?: string | null;
  status?: string | null;
  dealStatusId?: number | null;
  dealOwnerId?: number | null;
  assignedToUserId?: number | null;
  assignedInitials?: string | null;
  relatedContactId?: number | null;
  relatedOrganizationId?: number | null;
  probabilityPercent?: number | null;
  nextStep?: string | null;
  nextFollowUpDate?: string | null;
}

/** @deprecated Use {@link DealNormalized} / {@link DealUpsertDto}. */
export type DealApiDto = DealNormalized;
