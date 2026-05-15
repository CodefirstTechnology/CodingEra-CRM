import type { CallLogRow } from '../../features/call-logs/call-logs.component';
import type { ContactRow } from '../../features/contacts/contacts.component';
import type { DealPipelineStatus, DealRow } from '../../features/deals/deals.component';
import type { NoteRelatedType, NoteRow, NoteVisibility } from '../../features/notes/notes.component';
import type { OrganizationRow } from '../../features/organizations/organizations.component';
import type { TaskRow } from '../../features/tasks/tasks.component';
import { parseRevenueInputToNumber } from './revenue-parse';

function parseLegacyNoteRecord(record: string): {
  relatedType: NoteRelatedType;
  relatedName: string;
  visibility: NoteVisibility;
} {
  let vis: NoteVisibility = 'team';
  let r = record;
  if (r.endsWith(' · Private')) {
    vis = 'private';
    r = r.slice(0, -' · Private'.length);
  }
  const labelToRelatedType: Record<string, NoteRelatedType> = {
    Lead: 'lead',
    Deal: 'deal',
    Contact: 'contact',
    Organization: 'organization',
  };
  const idx = r.indexOf(' · ');
  if (idx < 0) {
    return { relatedType: 'deal', relatedName: r.trim(), visibility: vis };
  }
  const label = r.slice(0, idx).trim();
  const name = r.slice(idx + 3).trim();
  return {
    relatedType: labelToRelatedType[label] ?? 'deal',
    relatedName: name,
    visibility: vis,
  };
}

function durationMmSsToSeconds(dur: unknown): number {
  if (typeof dur === 'number' && Number.isFinite(dur)) return Math.max(0, Math.floor(dur));
  const str = String(dur ?? '');
  const parts = str.split(':');
  if (parts.length >= 2) {
    const m = Math.max(0, Math.min(99, Number(parts[0]) || 0));
    const s = Math.max(0, Math.min(59, Number(parts[1]) || 0));
    return m * 60 + s;
  }
  return 0;
}

export function normalizeDealRow(row: Record<string, unknown>): DealRow {
  const id = String(row['id'] ?? '');
  const orgName = String(row['organizationName'] ?? row['organization'] ?? '');
  const annualRevenue = parseRevenueInputToNumber(row['annualRevenue'] as string | number);
  const status = (row['status'] as DealPipelineStatus) ?? 'Qualification';
  const probRaw = row['probabilityPercent'];
  const probabilityPercent =
    probRaw != null && Number.isFinite(Number(probRaw)) ? Number(probRaw) : 10;
  return {
    id,
    organizationName: orgName,
    employees: String(row['employees'] ?? '1-10'),
    annualRevenue,
    website: String(row['website'] ?? ''),
    territory: String(row['territory'] ?? ''),
    industry: String(row['industry'] ?? 'Technology'),
    salutation: row['salutation'] != null ? String(row['salutation']) : '',
    firstName: String(row['firstName'] ?? ''),
    lastName: String(row['lastName'] ?? ''),
    email: String(row['email'] ?? ''),
    mobile: String(row['mobile'] ?? ''),
    gender: row['gender'] != null ? String(row['gender']) : '',
    status,
    dealOwnerId: String(row['dealOwnerId'] ?? ''),
    assignedTo: String(row['assignedTo'] ?? ''),
    assignedInitials: String(row['assignedInitials'] ?? ''),
    lastModified: String(row['lastModified'] ?? ''),
    ...(row['relatedContactId'] != null && row['relatedContactId'] !== ''
      ? { relatedContactId: String(row['relatedContactId']) }
      : {}),
    ...(row['relatedOrganizationId'] != null && row['relatedOrganizationId'] !== ''
      ? { relatedOrganizationId: String(row['relatedOrganizationId']) }
      : {}),
    probabilityPercent,
    nextStep: String(row['nextStep'] ?? ''),
    ...(row['requirement'] != null && row['requirement'] !== ''
      ? { requirement: String(row['requirement']) }
      : {}),
  };
}

export function normalizeOrganizationRow(row: Record<string, unknown>): OrganizationRow {
  const id = String(row['id'] ?? '');
  return {
    id,
    name: String(row['name'] ?? ''),
    website: String(row['website'] ?? ''),
    industry: String(row['industry'] ?? ''),
    annualRevenue: parseRevenueInputToNumber(row['annualRevenue'] as string | number),
    employees: String(row['employees'] ?? '1-10'),
    territory: String(row['territory'] ?? ''),
    lastModified: String(row['lastModified'] ?? ''),
  };
}

export function normalizeContactRow(row: Record<string, unknown>): ContactRow {
  const id = String(row['id'] ?? '');
  return {
    id,
    salutation: String(row['salutation'] ?? ''),
    firstName: String(row['firstName'] ?? ''),
    lastName: String(row['lastName'] ?? ''),
    email: String(row['email'] ?? ''),
    phone: String(row['phone'] ?? ''),
    gender: String(row['gender'] ?? ''),
    organization: String(row['organization'] ?? ''),
    designation: String(row['designation'] ?? ''),
    address: String(row['address'] ?? ''),
    lastModified: String(row['lastModified'] ?? ''),
  };
}

export function normalizeTaskRow(row: Record<string, unknown>): TaskRow {
  const id = String(row['id'] ?? '');
  const status = (row['status'] as TaskRow['status']) || 'Backlog';
  const priority = (row['priority'] as TaskRow['priority']) || 'Low';
  return {
    id,
    title: String(row['title'] ?? ''),
    description: String(row['description'] ?? ''),
    status,
    priority,
    dueDate: String(row['dueDate'] ?? ''),
    dueDateRaw: String(row['dueDateRaw'] ?? ''),
    assignedTo: String(row['assignedTo'] ?? ''),
    assignedInitials: String(row['assignedInitials'] ?? ''),
    lastModified: String(row['lastModified'] ?? ''),
  };
}

export function normalizeNoteRow(row: Record<string, unknown>): NoteRow {
  const id = String(row['id'] ?? '');
  const title = String(row['title'] ?? '');
  const author = String(row['author'] ?? '');
  const when = String(row['when'] ?? '');

  if (row['relatedType'] != null && row['body'] != null) {
    const body = String(row['body']);
    const bodyPreview =
      row['bodyPreview'] != null
        ? String(row['bodyPreview'])
        : body.length > 140
          ? `${body.slice(0, 140)}…`
          : body;
    return {
      id,
      title,
      relatedType: row['relatedType'] as NoteRelatedType,
      relatedName: String(row['relatedName'] ?? ''),
      relatedId: row['relatedId'] != null ? String(row['relatedId']) : undefined,
      visibility: (row['visibility'] as NoteVisibility) ?? 'team',
      body,
      author,
      when,
      bodyPreview,
    };
  }

  const record = String(row['record'] ?? '');
  const parsed = parseLegacyNoteRecord(record);
  const body = String(row['bodyStorage'] ?? row['body'] ?? '');
  const bodyPreview =
    row['bodyPreview'] != null
      ? String(row['bodyPreview'])
      : body.length > 140
        ? `${body.slice(0, 140)}…`
        : body;

  return {
    id,
    title,
    relatedType: parsed.relatedType,
    relatedName: parsed.relatedName,
    relatedId: row['relatedId'] != null ? String(row['relatedId']) : undefined,
    visibility: parsed.visibility,
    body,
    author,
    when,
    bodyPreview,
  };
}

export function normalizeCallLogRow(row: Record<string, unknown>): CallLogRow {
  const id = String(row['id'] ?? row['Id'] ?? row['callId'] ?? row['CallId'] ?? row['callLogId'] ?? row['CallLogId'] ?? '');
  const directionRaw = String(row['direction'] ?? row['Direction'] ?? 'Outbound').trim();
  const directionLower = directionRaw.toLowerCase();
  const direction = (
    directionLower === 'inbound' || directionLower === 'incoming'
      ? 'Inbound'
      : directionLower === 'outgoing'
        ? 'Outbound'
        : directionRaw === 'Inbound'
          ? 'Inbound'
          : 'Outbound'
  ) as CallLogRow['direction'];
  const phoneNumber = String(row['phoneNumber'] ?? row['PhoneNumber'] ?? row['number'] ?? row['Number'] ?? '');
  let contactName = String(row['contactName'] ?? row['ContactName'] ?? '');
  const summary = String(row['summary'] ?? row['Summary'] ?? row['callSummary'] ?? row['CallSummary'] ?? '');
  let startedAt = String(
    row['startedAt'] ??
      row['StartedAt'] ??
      row['callStarted'] ??
      row['CallStarted'] ??
      row['startedAtIso'] ??
      row['StartedAtIso'] ??
      '',
  );
  if (!startedAt) {
    startedAt = new Date().toISOString();
  }
  let durationSeconds = 0;
  if (row['durationMinutes'] != null || row['DurationMinutes'] != null) {
    const m = Math.max(0, Math.floor(Number(row['durationMinutes'] ?? row['DurationMinutes']) || 0));
    const s = Math.max(0, Math.floor(Number(row['durationSeconds'] ?? row['DurationSeconds']) || 0));
    durationSeconds = m * 60 + s;
  } else if (row['durationSeconds'] != null || row['DurationSeconds'] != null) {
    durationSeconds = Math.max(
      0,
      Math.floor(Number(row['durationSeconds'] ?? row['DurationSeconds']) || 0),
    );
  } else {
    durationSeconds = durationMmSsToSeconds(row['duration'] ?? row['Duration']);
  }
  const outcome = String(row['outcome'] ?? row['Outcome'] ?? 'Connected');
  const lastModified = String(row['lastModified'] ?? row['LastModified'] ?? '');

  let resolvedContactName = contactName;
  if (!resolvedContactName && row['contact'] != null) {
    const c = String(row['contact']);
    const idx = c.indexOf(' · ');
    resolvedContactName = idx < 0 ? c.trim() : c.slice(0, idx).trim();
  }

  const relatedLeadRaw = row['relatedLeadId'] ?? row['RelatedLeadId'];
  const relatedDealRaw = row['relatedDealId'] ?? row['RelatedDealId'];
  const relatedLeadId =
    relatedLeadRaw != null && String(relatedLeadRaw).trim() !== '' ? String(relatedLeadRaw).trim() : undefined;
  const relatedDealId =
    relatedDealRaw != null && String(relatedDealRaw).trim() !== '' ? String(relatedDealRaw).trim() : undefined;

  const out: CallLogRow = {
    id,
    direction,
    phoneNumber,
    contactName: resolvedContactName,
    startedAt,
    durationSeconds,
    outcome,
    summary,
    lastModified,
  };
  if (relatedLeadId !== undefined) out.relatedLeadId = relatedLeadId;
  if (relatedDealId !== undefined) out.relatedDealId = relatedDealId;
  return out;
}
