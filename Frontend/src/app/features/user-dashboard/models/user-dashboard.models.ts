import type { LeadStatus } from '../../leads/lead-row.model';

export type UserDashboardPeriodKey =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface UserDashboardPeriodOption {
  key: UserDashboardPeriodKey;
  label: string;
}

export const USER_DASHBOARD_PERIOD_OPTIONS: readonly UserDashboardPeriodOption[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom range' },
] as const;

export interface UserDashboardCustomRange {
  start: Date;
  end: Date;
}

export interface UserDashboardPeriodInfo {
  key: UserDashboardPeriodKey;
  label: string;
  start: Date;
  end: Date;
}

export interface UserDashboardFilters {
  periodKey: UserDashboardPeriodKey;
  customRange?: UserDashboardCustomRange | null;
}

export interface UserDashboardKpis {
  myLeads: number;
  wonDeals: number;
  activeDeals: number;
  followUpsToday: number;
  quotations: number;
  tasksPending: number;
  meetingsToday: number;
  monthlyRevenue: number;
}

export interface UserDashboardLeadTableRow {
  id: string;
  leadName: string;
  company: string;
  status: LeadStatus | string;
  priority: string;
  assignedDate: string;
  nextFollowUp: string;
  source: string;
}

export interface UserDashboardFollowUpItem {
  id: string;
  title: string;
  dueLabel: string;
  kind: 'upcoming' | 'overdue' | 'meeting';
  relatedName?: string;
}

export interface UserDashboardActivityItem {
  id: string;
  type: 'call' | 'meeting' | 'status' | 'note' | 'task';
  title: string;
  subtitle: string;
  timeLabel: string;
}

export interface UserDashboardPerformance {
  conversionPct: number;
  monthlyClosureRate: number;
  completedTasks: number;
  targetProgressPct: number;
  closedDeals: number;
  pendingCalls: number;
}

export interface UserDashboardLeadStatusSummary {
  status: string;
  count: number;
  pct: number;
}

export type UserDashboardKpiDetailKind =
  | 'leads'
  | 'deals'
  | 'wonDeals'
  | 'conversion'
  | 'followUps'
  | 'followUpsAll'
  | 'quotations'
  | 'tasks'
  | 'meetings'
  | 'revenue';

export interface UserDashboardDealDetail {
  id: string;
  dealName: string;
  company: string;
  status: string;
  value: number;
}

export interface UserDashboardQuotationDetail {
  id: number;
  quotationNumber: string;
  customerName: string;
  companyName: string;
  status: string;
  grandTotal: number;
  quotationDate: string;
}

export interface UserDashboardTaskDetail {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
}

export interface UserDashboardRevenueDealDetail {
  id: string;
  dealName: string;
  company: string;
  value: number;
  closedDate: string;
}

import type { UserTargetWidget } from '../../../core/services/user-targets/user-target-api.models';

export interface UserDashboardSnapshot {
  period: UserDashboardPeriodInfo;
  kpis: UserDashboardKpis;
  targetWidgets: UserTargetWidget[];
  assignedLeads: UserDashboardLeadTableRow[];
  todaysLeads: UserDashboardLeadTableRow[];
  followUps: UserDashboardFollowUpItem[];
  activities: UserDashboardActivityItem[];
  performance: UserDashboardPerformance;
  statusSummary: UserDashboardLeadStatusSummary[];
  activeDealDetails: UserDashboardDealDetail[];
  wonDealDetails: UserDashboardDealDetail[];
  quotationDetails: UserDashboardQuotationDetail[];
  pendingTaskDetails: UserDashboardTaskDetail[];
  monthlyRevenueDeals: UserDashboardRevenueDealDetail[];
}
