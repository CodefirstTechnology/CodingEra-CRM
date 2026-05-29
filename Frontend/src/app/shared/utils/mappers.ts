import type { DealPipelineStatus } from '../../core/services/deals/deal-pipeline.constants';
import { DEFAULT_DEAL_PIPELINE_STATUS } from '../../core/services/deals/deal-pipeline.constants';
import type { DealRow } from '../../features/deals/deals.component';
import type { LeadRow, LeadStatus } from '../../features/leads/lead-row.model';
import { leadContactName } from './lead-conversion.util';

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

export function buildDealTitleFromLead(lead: LeadRow): string {
  const org = lead.organization?.trim();
  const contact = leadContactName(lead);
  if (org && contact) return `${org} — ${contact}`;
  return org || contact || lead.name.trim() || 'New deal';
}

export function mapLeadToDealDraft(lead: LeadRow): LeadToDealDraft {
  return {
    title: buildDealTitleFromLead(lead),
    company: lead.organization,
    contactEmail: lead.email ?? '',
    contactPhone: (lead.mobile ?? '').trim(),
    stage: 'New',
    value: parseLeadNumericValue(lead),
    source: 'Converted Lead',
    assignedTo: lead.leadOwnerName?.trim() ? lead.leadOwnerName : null,
    createdAt: new Date().toISOString(),
  };
}

export function mapLeadStatusToDealPipelineStatus(status: LeadStatus): DealPipelineStatus {
  switch (status) {
    case 'Qualified':
      return 'Quotation Shared';
    case 'Lost':
      return 'Lead Closed - Lost';
    case 'Contacted':
      return 'Quotation Shared';
    case 'Converted':
      return DEFAULT_DEAL_PIPELINE_STATUS;
    default:
      return DEFAULT_DEAL_PIPELINE_STATUS;
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
  const contactName = leadContactName(lead);
  const createdAt = new Date().toISOString();
  const orgId = lead.organizationId?.trim();
  return {
    dealTitle: draft.title,
    contactName,
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
    dealOwnerId: ownerId,
    assignedToUserId: ownerId || undefined,
    assignedTo: assignedTo || 'Unassigned',
    assignedInitials: assignedInitials || '-',
    lastModified: 'Just now',
    createdAt,
    requirement: (lead.requirement ?? lead.notes ?? '').trim(),
    notes: (lead.notes ?? '').trim() || undefined,
    source: 'lead_conversion',
    sourceLeadId: lead.id,
    relatedOrganizationId: orgId && Number(orgId) > 0 ? orgId : undefined,
  };
}
