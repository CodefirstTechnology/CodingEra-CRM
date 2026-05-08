/** CRM pipeline status (manual leads + unified list). */
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Lost' | 'Converted';

/** Origin of the row in the unified Leads view (frontend mapping; optional on API payloads). */
export type LeadSource = 'Manual' | 'IndiaMART';

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
  mobile?: string;
  gender?: string;
  email: string;
  organization: string;
  employees?: string;
  annualRevenue?: string;
  website?: string;
  territory?: string;
  industry: string;
  status: LeadStatus;
  requestType?: string;
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
