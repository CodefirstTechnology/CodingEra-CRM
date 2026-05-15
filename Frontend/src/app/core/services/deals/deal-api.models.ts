/**
 * Deal as returned by `GET/POST/PUT https://…/api/deals` (camelCase JSON, Swagger-aligned).
 */
export interface DealApiDto {
  id: number;
  organizationId: number;
  contactId: number;
  organizationName: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  gender: string;
  annualRevenue: number;
  employees: string;
  website: string;
  territory: string;
  industry: string;
  status: string;
  dealOwnerId: number;
  assignedToUserId: number;
  assignedInitials: string;
  relatedContactId: number;
  relatedOrganizationId: number;
  probabilityPercent: number;
  nextStep: string;
  lastModified: string;
}
