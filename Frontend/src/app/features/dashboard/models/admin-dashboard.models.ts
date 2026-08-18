import type { LeadStatus } from '../../leads/lead-row.model';

export type AdminTeamSortKey =
  | 'qualifiedLeads'
  | 'monthlyRevenue'
  | 'convertedLeads'
  | 'activeDeals'
  | 'targetAchieved';

export type AdminDashboardPeriodKey =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export type AdminActivityStreamKind = 'lead' | 'deal' | 'item' | 'task' | 'email' | 'call' | 'meeting' | 'other';

export interface AdminDashboardPeriod {
  key: AdminDashboardPeriodKey;
  label: string;
  start: Date;
  end: Date;
}

/** Optional inclusive date bounds used when period key is `custom`. */
export interface AdminDashboardCustomRange {
  start: Date;
  end: Date;
}

export interface AdminDashboardKpis {
  /** Leads whose record date falls in the selected period. */
  totalLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  /** Closed-won deals whose record date falls in the selected period. */
  wonDeals: number;
  /** (Won Deals ÷ Total Leads) × 100 for the selected period. */
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
  revenueChangePct?: number;
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
  actorUserId?: number | null;
  createdAt?: string;
}

import type { UserTargetRow } from '../../../core/services/user-targets/user-target-api.models';

export interface AggregatedTargetPeriod {
  startDate: string;
  endDate: string;
  targetAmount: number;
  achievedAmount: number;
  targetAchievedPct: number;
  hasTargetsConfigured: boolean;
  targets: UserTargetRow[];
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
  wonDealDetails: AdminDealDetail[];
  activities: AdminActivityStreamItem[];
  focusInsight: string;
  activeTargetPeriod?: AggregatedTargetPeriod | null;
  previousTargetPeriod?: AggregatedTargetPeriod | null;
  previousTargetPeriods?: AggregatedTargetPeriod[];
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

/** `all` = every non-admin role; otherwise filter by `crm_roles.id`. */
export type AdminTeamRoleFilter = 'all' | number;

/** `all` = every lead status in period; otherwise only leads with this status. */
export type AdminTeamLeadStatusFilter = 'all' | LeadStatus;

export interface AdminDashboardTeamFilters {
  roleId: AdminTeamRoleFilter;
  leadStatus: AdminTeamLeadStatusFilter;
}

export const DEFAULT_ADMIN_DASHBOARD_TEAM_FILTERS: AdminDashboardTeamFilters = {
  roleId: 'all',
  leadStatus: 'all',
};

export const ADMIN_TEAM_LEAD_STATUS_OPTIONS: readonly {
  value: AdminTeamLeadStatusFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All statuses' },
  ...LEAD_STATUS_KEYS.map((status) => ({ value: status as AdminTeamLeadStatusFilter, label: status })),
];

export const ADMIN_DASHBOARD_PERIOD_OPTIONS: readonly { key: AdminDashboardPeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom date range' },
] as const;
