import type { DealPipelineStatus, DealRow } from '../../features/deals/deals.component';
import type { LeadRow, LeadStatus } from '../../features/leads/lead-row.model';

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
  const firstName = (lead.firstName ?? '').trim() || lead.name.trim().split(/\s+/)[0] || 'Contact';
  const lastName =
    (lead.lastName ?? '').trim() ||
    lead.name
      .trim()
      .split(/\s+/)
      .slice(1)
      .join(' ') ||
    'Primary';
  const assignedTo = (lead.leadOwnerName ?? '').trim();
  const assignedInitials = (lead.owner ?? '').trim();
  const ownerId = (lead.leadOwnerId ?? '').trim();
  return {
    organizationName: draft.company.trim() || 'Unknown organization',
    employees: (lead.employees ?? '').trim() || '1-10',
    employeeCountId: lead.employeeCountId ?? undefined,
    annualRevenue: parseLeadNumericValue(lead),
    website: (lead.website ?? '').trim(),
    territory: (lead.territory ?? '').trim(),
    territoryId: lead.territoryId ?? undefined,
    industry: (lead.industry ?? '').trim() || 'Other',
    industryId: lead.industryId ?? undefined,
    salutation: (lead.salutation ?? '').trim(),
    salutationId: lead.salutationId ?? undefined,
    firstName,
    lastName,
    email: draft.contactEmail.trim(),
    mobile,
    gender: (lead.gender ?? '').trim(),
    status: mapLeadStatusToDealPipelineStatus(lead.status),
    dealStatusId: lead.leadStatusId ?? undefined,
    dealOwnerId: ownerId,
    assignedToUserId: ownerId || undefined,
    assignedTo: assignedTo || 'Unassigned',
    assignedInitials: assignedInitials || '-',
    lastModified: 'Just now',
    requirement: (lead.requirement ?? lead.notes ?? '').trim(),
  };
}
