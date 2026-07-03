import type { LeadStatus } from '../../leads/lead-row.model';

export interface UserDashboardKpis {
  myLeads: number;
  activeDeals: number;
  followUpsToday: number;
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
  | 'followUps'
  | 'followUpsAll'
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

export interface UserDashboardSnapshot {
  kpis: UserDashboardKpis;
  assignedLeads: UserDashboardLeadTableRow[];
  todaysLeads: UserDashboardLeadTableRow[];
  followUps: UserDashboardFollowUpItem[];
  activities: UserDashboardActivityItem[];
  performance: UserDashboardPerformance;
  statusSummary: UserDashboardLeadStatusSummary[];
  activeDealDetails: UserDashboardDealDetail[];
  pendingTaskDetails: UserDashboardTaskDetail[];
  monthlyRevenueDeals: UserDashboardRevenueDealDetail[];
}
