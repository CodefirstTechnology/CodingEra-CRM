import type { LeadStatus } from '../../leads/lead-row.model';

export type AdminTeamSortKey =
  | 'qualifiedLeads'
  | 'monthlyRevenue'
  | 'convertedLeads'
  | 'activeDeals';

export type AdminActivityStreamKind = 'lead' | 'deal' | 'task' | 'email' | 'call' | 'meeting' | 'other';

export interface AdminDashboardKpis {
  totalLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  conversionRatePct: number;
  newLeadsThisMonth: number;
  activePipelineCount: number;
  pipelineRevenue: number;
  monthlyRevenue: number;
  monthlyTarget: number;
  monthlyTargetAchievedPct: number;
}

export interface AdminPipelineSegment {
  label: string;
  count: number;
  revenue: number;
  pct: number;
}

export interface AdminTeamMemberStats {
  userId: string;
  name: string;
  email: string;
  totalLeads: number;
  qualifiedLeads: number;
  contactedLeads: number;
  newLeads: number;
  nurtureLeads: number;
  unqualifiedLeads: number;
  junkLeads: number;
  lostLeads: number;
  convertedLeads: number;
  conversionRatePct: number;
  activeDeals: number;
  closedWonMonth: number;
  monthlyRevenue: number;
  overdueTasks: number;
}

export interface AdminStuckDealRow {
  id: string;
  dealName: string;
  company: string;
  owner: string;
  stage: string;
  inactiveDays: number;
  revenue: number;
}

export interface AdminActivityStreamItem {
  id: string;
  kind: AdminActivityStreamKind;
  entityType: 'lead' | 'deal' | 'other';
  entityId: string;
  recordRoute: string | null;
  title: string;
  company: string;
  description: string;
  timeLabel: string;
  rep: string;
}

export interface AdminDashboardSnapshot {
  kpis: AdminDashboardKpis;
  pipelineSegments: AdminPipelineSegment[];
  team: AdminTeamMemberStats[];
  stuckDeals: AdminStuckDealRow[];
  activities: AdminActivityStreamItem[];
  focusInsight: string;
}

export const LEAD_STATUS_KEYS: LeadStatus[] = [
  'New',
  'Contacted',
  'Nurture',
  'Unqualified',
  'Qualified',
  'Junk',
  'Lost',
  'Converted',
];
