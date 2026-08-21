export interface StuckPipelineSummary {
  stuckValue: number;
  stuckDealsCount: number;
  avgIdleHours: number;
  avgIdleTimeFormatted: string;
  idleLeadsCount: number;
}

export interface StuckDealItem {
  dealId: number;
  dealTitle: string;
  organizationName: string;
  contactName: string;
  stage: string;
  dealAmount: number;
  lastActivityAt: string;
  idleHours: number;
  idleDurationFormatted: string;
  ownerId: number | null;
  ownerName: string;
}

export interface IdleLeadItem {
  leadId: number;
  leadName: string;
  organizationName: string;
  status: string;
  createdAt: string | null;
  lastActivityAt: string | null;
  idleHours: number;
  idleDurationFormatted: string;
  ownerId: number | null;
  ownerName: string;
  mobile: string;
  email: string;
}

export interface StuckPipelineResponse {
  summary: StuckPipelineSummary;
  stuckDeals: StuckDealItem[];
  idleLeads: IdleLeadItem[];
}
