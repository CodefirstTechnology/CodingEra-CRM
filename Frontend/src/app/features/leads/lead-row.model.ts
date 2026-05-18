/** CRM pipeline status (manual leads + unified list). */
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Lost' | 'Converted';

/** Marketplace origins shown in the unified Leads view. */
export type MarketplaceLeadSource = 'IndiaMART' | 'Justdial' | 'TradeIndia';

/** Origin of the row in the unified Leads view (frontend mapping; optional on API payloads). */
export type LeadSource = 'Manual' | MarketplaceLeadSource;

export interface LeadOwnerOption {
  id: string;
  label: string;
  initials: string;
}

export interface LeadRow {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  salutation?: string;
  /** Master data FK (`/api/MasterData/salutations`); preferred over label-only salutation on save. */
  salutationId?: number | null;
  mobile?: string;
  gender?: string;
  email: string;
  organization: string;
  employees?: string;
  /** Master data FK (`/api/MasterData/employee-counts`) when resolving organization. */
  employeeCountId?: number | null;
  annualRevenue?: string;
  website?: string;
  territory?: string;
  /** Master data FK (`/api/MasterData/territories`) when resolving organization. */
  territoryId?: number | null;
  industry: string;
  /** Master data FK (`/api/MasterData/industries`) when resolving organization. */
  industryId?: number | null;
  /** Job title / role (optional). */
  jobTitle?: string;
  status: LeadStatus;
  /** Master data FK (`/api/MasterData/lead-statuses`). */
  leadStatusId?: number | null;
  requestType?: string;
  /** Master data FK (`/api/MasterData/request-types`). */
  requestTypeId?: number | null;
  requirement?: string;
  notes?: string;
  leadOwnerName: string;
  owner: string;
  updated: string;
  source?: string;
  /** Owner picker key (e.g. SK), mirrors form `leadOwner`. */
  leadOwnerId?: string;
  /** Set for unified list: manual CRM vs IndiaMART import. */
  leadSource?: LeadSource;
  /** Used to merge/sort manual + IndiaMART rows (optional on persisted data). */
  sortTimestamp?: number;
}

export type LeadListStatusFilter = 'all' | LeadStatus;

export type LeadListSourceFilter = 'all' | LeadSource;
