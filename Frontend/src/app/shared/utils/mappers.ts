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

function formatAnnualRevenueForDeal(lead: LeadRow): string {
  const raw = lead.annualRevenue?.trim() ?? '';
  if (!raw) return '₹ 0.00';
  return raw.startsWith('₹') ? raw : `₹ ${raw}`;
}

/**
 * Maps a lead to the shape expected by {@link DealsService#create} / local deal rows.
 */
export function mapLeadToDealRow(lead: LeadRow): Omit<DealRow, 'id'> {
  const draft = mapLeadToDealDraft(lead);
  return {
    organization: draft.company,
    annualRevenue: formatAnnualRevenueForDeal(lead),
    status: mapLeadStatusToDealPipelineStatus(lead.status),
    email: draft.contactEmail.trim() || '—',
    mobile: draft.contactPhone.trim() || '—',
    assignedTo: lead.leadOwnerName || '—',
    assignedInitials: lead.owner || '—',
    lastModified: 'Just now',
  };
}
