/** Metrics sent from the admin dashboard for the daily executive briefing. */
export interface DailyBriefingMetrics {
  adminName?: string;
  totalLeads: number;
  activeDeals: number;
  newLeadsToday: number;
  newDealsToday: number;
  pendingFollowUps: number;
  followUpsToday: number;
  overdueFollowUps: number;
  dealsPendingClosure: number;
  dealsWonToday: number;
  dealsLostToday: number;
  meetingsToday: number;
  tasksDueToday: number;
  highPriorityLeads: number;
  stuckDealsCount: number;
  stuckLeadsCount: number;
  revenueToday: number | null;
}

export interface UserDashboardPreference {
  morningBriefingEnabled: boolean;
  lastBriefingPlayedDate: string | null;
}

export interface MorningBriefingResponse {
  message: string;
  source: 'ai' | 'fallback' | 'cached' | string;
  cached: boolean;
  metrics: DailyBriefingMetrics;
}
