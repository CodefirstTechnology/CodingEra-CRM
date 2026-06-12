import type { DailyBriefingMetrics } from '../../../core/services/dashboard/dashboard-api.models';

const SMALL_NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
] as const;

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function meetingPhrase(count: number): string {
  if (count <= 0) return '';
  if (count <= 10) {
    const word = capitalize(SMALL_NUMBERS[count]);
    return `${word} meeting${count === 1 ? '' : 's'} are scheduled`;
  }
  return `${formatCount(count)} meetings are scheduled`;
}

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Executive-style daily briefing paragraph (shared by client fallback and target AI tone). */
export function buildExecutiveBriefingFromMetrics(m: DailyBriefingMetrics): string {
  const hour = new Date().getHours();
  const adminName = m.adminName?.trim() || 'Admin';
  const parts: string[] = [`Hi ${adminName} ${timeGreeting(hour)}.`];

  if (m.totalLeads > 0) {
    parts.push(`The CRM currently contains ${formatCount(m.totalLeads)} leads.`);
  }

  if (m.newLeadsToday > 0) {
    const verb = m.newLeadsToday === 1 ? 'was' : 'were';
    parts.push(
      `${formatCount(m.newLeadsToday)} new lead${m.newLeadsToday === 1 ? '' : 's'} ${verb} added today.`,
    );
  }

  if (m.pendingFollowUps > 0) {
    let line = `${formatCount(m.pendingFollowUps)} follow-up${m.pendingFollowUps === 1 ? '' : 's'} remain pending`;
    if (m.overdueFollowUps > 0) {
      line += `, including ${formatCount(m.overdueFollowUps)} overdue activit${m.overdueFollowUps === 1 ? 'y' : 'ies'}`;
    }
    parts.push(`${line}.`);
  } else if (m.overdueFollowUps > 0) {
    parts.push(
      `${formatCount(m.overdueFollowUps)} overdue activit${m.overdueFollowUps === 1 ? 'y' : 'ies'} need attention.`,
    );
  }

  if (m.activeDeals > 0) {
    let line = `There are ${formatCount(m.activeDeals)} active deal${m.activeDeals === 1 ? '' : 's'}`;
    if (m.dealsPendingClosure > 0) {
      line += `, with ${formatCount(m.dealsPendingClosure)} expected to close today`;
    }
    parts.push(`${line}.`);
  }

  const meetingLine = meetingPhrase(m.meetingsToday);
  if (meetingLine) {
    parts.push(`${meetingLine}.`);
  }

  if (m.stuckDealsCount > 0 && m.stuckLeadsCount > 0) {
    parts.push(
      `${formatCount(m.stuckDealsCount)} deal${m.stuckDealsCount === 1 ? '' : 's'} and `
        + `${formatCount(m.stuckLeadsCount)} lead${m.stuckLeadsCount === 1 ? '' : 's'} `
        + 'have been inactive for over 24 hours.',
    );
  } else if (m.stuckDealsCount > 0) {
    const verb = m.stuckDealsCount === 1 ? 'has' : 'have';
    parts.push(
      `${formatCount(m.stuckDealsCount)} deal${m.stuckDealsCount === 1 ? '' : 's'} `
        + `${verb} been inactive for over 24 hours.`,
    );
  } else if (m.stuckLeadsCount > 0) {
    const verb = m.stuckLeadsCount === 1 ? 'has' : 'have';
    parts.push(
      `${formatCount(m.stuckLeadsCount)} lead${m.stuckLeadsCount === 1 ? '' : 's'} `
        + `${verb} been inactive for over 24 hours.`,
    );
  }

  const needsAttention =
    m.overdueFollowUps > 0
    || m.highPriorityLeads > 0
    || m.stuckDealsCount > 0
    || m.stuckLeadsCount > 0;

  if (needsAttention) {
    parts.push(
      'Immediate attention is recommended for overdue follow-ups and high-priority opportunities.',
    );
  }

  return parts.join(' ');
}
