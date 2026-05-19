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

export interface UserDashboardSnapshot {
  kpis: UserDashboardKpis;
  assignedLeads: UserDashboardLeadTableRow[];
  todaysLeads: UserDashboardLeadTableRow[];
  followUps: UserDashboardFollowUpItem[];
  activities: UserDashboardActivityItem[];
  performance: UserDashboardPerformance;
  statusSummary: UserDashboardLeadStatusSummary[];
}
