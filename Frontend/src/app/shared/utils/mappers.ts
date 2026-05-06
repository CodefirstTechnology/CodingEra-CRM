import type { DealPipelineStatus, DealRow } from '../../features/deals/deals.component';
import type { LeadRow, LeadStatus } from '../../features/leads/leads.component';

/**
 * Backend-friendly DTO for creating a deal from a lead (reuse with HttpClient later).
 */
export interface LeadToDealDraft {
  title: string;
  company: string;
  contactEmail: string;
  contactPhone: string;
  /** Pipeline label for APIs that use string stages (e.g. "New"). */
  stage: string;
  value: number;
  source: string;
  assignedTo: string | null;
  createdAt: string;
}

export function parseLeadNumericValue(lead: LeadRow): number {
  const raw = lead.annualRevenue?.replace(/[₹,\s]/g, '') ?? '';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function mapLeadToDealDraft(lead: LeadRow): LeadToDealDraft {
  return {
    title: lead.name,
    company: lead.organization,
    contactEmail: lead.email ?? '',
    contactPhone: (lead.mobile ?? '').trim(),
    stage: 'New',
    value: parseLeadNumericValue(lead),
    source: lead.source ?? 'Lead Conversion',
    assignedTo: lead.leadOwnerName?.trim() ? lead.leadOwnerName : null,
    createdAt: new Date().toISOString(),
  };
}

export function mapLeadStatusToDealPipelineStatus(status: LeadStatus): DealPipelineStatus {
  switch (status) {
    case 'Qualified':
      return 'Proposal';
    case 'Lost':
      return 'Closed Lost';
    case 'Contacted':
      return 'Qualification';
    case 'Converted':
      return 'Qualification';
    default:
      return 'Qualification';
  }
}

/**
 * Maps a lead to the shape expected by {@link DealsService#create} / local deal rows.
 * Carries org + contact + pipeline fields so conversion does not drop CRM data.
 */
export function mapLeadToDealRow(lead: LeadRow): Omit<DealRow, 'id'> {
  const draft = mapLeadToDealDraft(lead);
  const mobile = draft.contactPhone.replace(/\D/g, '');
  return {
    organizationName: draft.company.trim(),
    employees: (lead.employees ?? '').trim() || '1-10',
    annualRevenue: parseLeadNumericValue(lead),
    website: (lead.website ?? '').trim(),
    territory: (lead.territory ?? '').trim(),
    industry: (lead.industry ?? '').trim() || 'Other',
    salutation: (lead.salutation ?? '').trim(),
    firstName: (lead.firstName ?? '').trim(),
    lastName: (lead.lastName ?? '').trim(),
    email: draft.contactEmail.trim(),
    mobile,
    gender: (lead.gender ?? '').trim(),
    status: mapLeadStatusToDealPipelineStatus(lead.status),
    dealOwnerId: (lead.leadOwnerId ?? lead.owner ?? '').trim(),
    assignedTo: (lead.leadOwnerName ?? '').trim(),
    assignedInitials: (lead.owner ?? '').trim(),
    lastModified: 'Just now',
  };
}
