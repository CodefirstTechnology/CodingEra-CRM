import type { DailyBriefingMetrics } from '../../../core/services/dashboard/dashboard-api.models';
import { buildExecutiveBriefingFromMetrics } from './briefing-message.util';

/** Client-side fallback — executive daily briefing from dashboard metrics. */
export function buildDailyBriefingFromMetrics(m: DailyBriefingMetrics): string {
  return buildExecutiveBriefingFromMetrics(m);
}
