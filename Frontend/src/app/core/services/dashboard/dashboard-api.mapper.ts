import type {
  DailyBriefingMetrics,
  MorningBriefingResponse,
  UserDashboardPreference,
} from './dashboard-api.models';

function num(raw: unknown, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function str(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback;
}

export function mapDailyBriefingMetrics(raw: unknown): DailyBriefingMetrics {
  const r = (raw ?? {}) as Record<string, unknown>;
  const revenueToday = nullableNum(r['revenueToday'] ?? r['RevenueToday']);
  const adminName = str(r['adminName'] ?? r['AdminName'], '');
  return {
    adminName: adminName || undefined,
    totalLeads: num(r['totalLeads'] ?? r['TotalLeads']),
    activeDeals: num(r['activeDeals'] ?? r['ActiveDeals']),
    newLeadsToday: num(r['newLeadsToday'] ?? r['NewLeadsToday']),
    newDealsToday: num(r['newDealsToday'] ?? r['NewDealsToday']),
    pendingFollowUps: num(r['pendingFollowUps'] ?? r['PendingFollowUps']),
    followUpsToday: num(r['followUpsToday'] ?? r['FollowUpsToday']),
    overdueFollowUps: num(r['overdueFollowUps'] ?? r['OverdueFollowUps']),
    dealsPendingClosure: num(r['dealsPendingClosure'] ?? r['DealsPendingClosure']),
    dealsWonToday: num(r['dealsWonToday'] ?? r['DealsWonToday']),
    dealsLostToday: num(r['dealsLostToday'] ?? r['DealsLostToday']),
    meetingsToday: num(r['meetingsToday'] ?? r['MeetingsToday']),
    tasksDueToday: num(r['tasksDueToday'] ?? r['TasksDueToday']),
    highPriorityLeads: num(r['highPriorityLeads'] ?? r['HighPriorityLeads']),
    stuckDealsCount: num(r['stuckDealsCount'] ?? r['StuckDealsCount']),
    stuckLeadsCount: num(r['stuckLeadsCount'] ?? r['StuckLeadsCount']),
    revenueToday: revenueToday != null && revenueToday > 0 ? revenueToday : null,
  };
}

export function mapUserDashboardPreference(raw: unknown): UserDashboardPreference {
  const r = (raw ?? {}) as Record<string, unknown>;
  const played = r['lastBriefingPlayedDate'] ?? r['LastBriefingPlayedDate'];
  return {
    morningBriefingEnabled: Boolean(
      r['morningBriefingEnabled'] ?? r['MorningBriefingEnabled'] ?? true,
    ),
    lastBriefingPlayedDate:
      typeof played === 'string' && played.trim() ? played.trim() : null,
  };
}

export function mapMorningBriefingResponse(raw: unknown): MorningBriefingResponse {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    message: str(r['message'] ?? r['Message']),
    source: str(r['source'] ?? r['Source'], 'fallback'),
    cached: Boolean(r['cached'] ?? r['Cached']),
    metrics: mapDailyBriefingMetrics(r['metrics'] ?? r['Metrics'] ?? r['summary'] ?? r['Summary']),
  };
}
