import type { LeadStatus } from '../../leads/lead-row.model';

export type AdminTeamSortKey =
  | 'qualifiedLeads'
  | 'monthlyRevenue'
  | 'convertedLeads'
  | 'activeDeals'
  | 'targetAchieved';

export type AdminDashboardPeriodKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year';

export type AdminActivityStreamKind = 'lead' | 'deal' | 'task' | 'email' | 'call' | 'meeting' | 'other';

export interface AdminDashboardPeriod {
  key: AdminDashboardPeriodKey;
  label: string;
  start: Date;
  end: Date;
}

export interface AdminDashboardKpis {
  totalLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  conversionRatePct: number;
  newLeadsInPeriod: number;
  activePipelineCount: number;
  pipelineRevenue: number;
  /** Sum of achieved amounts from active user targets overlapping the period. */
  periodAchieved: number;
  /** Sum of target amounts from active user targets overlapping the period. */
  periodTarget: number;
  targetAchievedPct: number;
  hasTargetsConfigured: boolean;
}

export interface AdminDealDetail {
  id: string;
  dealName: string;
  company: string;
  owner: string;
  ownerUserId: string;
  stage: string;
  value: number;
  inactiveHours?: number;
}

export interface AdminLeadDetail {
  id: string;
  name: string;
  company: string;
  status: string;
  owner: string;
}

export interface AdminPipelineSegment {
  label: string;
  statusId: number;
  sortOrder: number;
  count: number;
  revenue: number;
  pct: number;
  deals: AdminDealDetail[];
}

export interface AdminTeamMemberStats {
  userId: string;
  name: string;
  email: string;
  totalLeads: number;
  qualifiedLeads: number;
  contactedLeads: number;
  nurtureLeads: number;
  unqualifiedLeads: number;
  junkLeads: number;
  lostLeads: number;
  convertedLeads: number;
  conversionRatePct: number;
  activeDeals: number;
  dealsClosedWon: number;
  dealsClosedLost: number;
  /** Achieved amount from overlapping user targets, else closed-won deal value in period. */
  monthlyRevenue: number;
  targetAmount: number;
  targetAchieved: number;
}

export interface AdminStuckDealRow {
  id: string;
  dealName: string;
  company: string;
  owner: string;
  stage: string;
  inactiveHours: number;
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
  period: AdminDashboardPeriod;
  kpis: AdminDashboardKpis;
  pipelineSegments: AdminPipelineSegment[];
  team: AdminTeamMemberStats[];
  stuckDeals: AdminStuckDealRow[];
  leadDetails: AdminLeadDetail[];
  newLeadDetails: AdminLeadDetail[];
  openDealDetails: AdminDealDetail[];
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

export const ADMIN_DASHBOARD_PERIOD_OPTIONS: readonly { key: AdminDashboardPeriodKey; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'this_year', label: 'This year' },
] as const;
