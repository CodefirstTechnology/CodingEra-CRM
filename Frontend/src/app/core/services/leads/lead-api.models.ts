/**
 * Shape of a Lead as returned by the ASP.NET Core API (camelCase JSON).
 * Mirrors `CRM.models.Lead` in the backend.
 */
export interface LeadApiDto {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  salutation: string;
  gender: string;
  mobile: string;
  email: string;
  organization: string;
  organizationId: number | null;
  employees: string;
  annualRevenue: number | null;
  website: string;
  territory: string;
  industry: string;
  jobTitle: string;
  status: string;
  requestType: string;
  notes: string;
  source: string;
  leadOwnerName: string;
  owner: string;
  leadOwnerId: number | null;
  updatedAt: string;
  leadSource: string;
  sortTimestamp: number | null;
  externalRef: string | null;
  product: string | null;
  quantity: number | null;
  message: string | null;
  city: string | null;
  createdAt: string | null;
}
