import type { ContactRow } from '../../features/contacts/contacts.component';
import type { DealRow } from '../../features/deals/deals.component';
import { DEFAULT_DEAL_PIPELINE_STATUS, resolveDealStatusLabel } from '../../core/services/deals/deal-pipeline.constants';
import type { NoteRelatedType, NoteRow, NoteVisibility } from '../../features/notes/notes.component';
import type { OrganizationRow } from '../../features/organizations/organizations.component';
import type { TaskRow } from '../../features/tasks/tasks.component';
import { normalizeGstin } from './gstin.util';
import {
  inboundAddress,
  inboundCompany,
  inboundEmail,
  inboundGender,
  inboundMaster,
  inboundMobile,
  inboundPerson,
  inboundTitle,
  inboundDescription,
  inboundWebsite,
} from './text-normalizer/inbound-format';
import { parseRevenueInputToNumber } from './revenue-parse';

function formatDisplayPerson(raw: string): string {
  const s = raw.trim();
  if (!s || s === '—' || /^User #\d+$/i.test(s)) return s;
  return inboundPerson(s) || s;
}

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
  const orgName = inboundCompany(String(row['organizationName'] ?? row['organization'] ?? ''));
  const annualRevenue = parseRevenueInputToNumber(row['annualRevenue'] as string | number);
  const dealAmount = parseRevenueInputToNumber(row['dealAmount'] as string | number);
  const status = resolveDealStatusLabel(String(row['status'] ?? DEFAULT_DEAL_PIPELINE_STATUS));
  const probRaw = row['probabilityPercent'];
  const probabilityPercent =
    probRaw != null && Number.isFinite(Number(probRaw)) ? Number(probRaw) : 10;
  return {
    id,
    organizationName: orgName,
    employees: String(row['employees'] ?? '1-10'),
    annualRevenue,
    dealAmount,
    website: inboundWebsite(String(row['website'] ?? '')),
    ...(row['gst'] != null && normalizeGstin(String(row['gst'])) !== ''
      ? { gst: normalizeGstin(String(row['gst'])) }
      : {}),
    territory: inboundMaster('territory', String(row['territory'] ?? '')),
    industry: inboundMaster('industry', String(row['industry'] ?? '')) || 'Technology',
    salutation: inboundPerson(String(row['salutation'] ?? '')),
    firstName: inboundPerson(String(row['firstName'] ?? '')),
    lastName: inboundPerson(String(row['lastName'] ?? '')),
    email: inboundEmail(String(row['email'] ?? '')),
    mobile: inboundMobile(String(row['mobile'] ?? '')),
    gender: inboundGender(String(row['gender'] ?? '')),
    status,
    dealOwnerId: String(row['dealOwnerId'] ?? ''),
    assignedTo: formatDisplayPerson(String(row['assignedTo'] ?? '')),
    assignedInitials: String(row['assignedInitials'] ?? ''),
    lastModified: String(row['lastModified'] ?? ''),
    ...(row['relatedContactId'] != null && row['relatedContactId'] !== ''
      ? { relatedContactId: String(row['relatedContactId']) }
      : {}),
    ...(row['relatedOrganizationId'] != null && row['relatedOrganizationId'] !== ''
      ? { relatedOrganizationId: String(row['relatedOrganizationId']) }
      : {}),
    probabilityPercent,
    nextStep: inboundDescription(String(row['nextStep'] ?? '')),
    ...(row['requirement'] != null && row['requirement'] !== ''
      ? { requirement: String(row['requirement']) }
      : {}),
  };
}

function optPositiveIntField(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

export function normalizeOrganizationRow(row: Record<string, unknown>): OrganizationRow {
  const id = String(row['id'] ?? '');
  const industryId = optPositiveIntField(row['industryId']);
  const employeeCountId = optPositiveIntField(row['employeeCountId']);
  const territoryId = optPositiveIntField(row['territoryId']);
  const addressRaw = row['address'];
  return {
    id,
    name: inboundCompany(String(row['name'] ?? '')),
    website: inboundWebsite(String(row['website'] ?? '')),
    ...(row['gst'] != null && normalizeGstin(String(row['gst'])) !== ''
      ? { gst: normalizeGstin(String(row['gst'])) }
      : {}),
    industry: inboundMaster('industry', String(row['industry'] ?? '')),
    annualRevenue: parseRevenueInputToNumber(row['annualRevenue'] as string | number),
    employees: String(row['employees'] ?? '1-10'),
    territory: inboundMaster('territory', String(row['territory'] ?? '')),
    lastModified: String(row['lastModified'] ?? ''),
    ...(addressRaw != null && String(addressRaw).trim() !== ''
      ? { address: inboundAddress(String(addressRaw)) }
      : {}),
    ...(industryId != null ? { industryId } : {}),
    ...(employeeCountId != null ? { employeeCountId } : {}),
    ...(territoryId != null ? { territoryId } : {}),
  };
}

export function normalizeContactRow(row: Record<string, unknown>): ContactRow {
  const id = String(row['id'] ?? '');
  return {
    id,
    salutation: inboundPerson(String(row['salutation'] ?? '')),
    firstName: inboundPerson(String(row['firstName'] ?? '')),
    lastName: inboundPerson(String(row['lastName'] ?? '')),
    email: inboundEmail(String(row['email'] ?? '')),
    phone: inboundMobile(String(row['phone'] ?? '')),
    gender: inboundGender(String(row['gender'] ?? '')),
    organization: inboundCompany(String(row['organization'] ?? '')),
    designation: inboundMaster('designation', String(row['designation'] ?? '')),
    address: inboundAddress(String(row['address'] ?? '')),
    lastModified: String(row['lastModified'] ?? ''),
  };
}

export function normalizeTaskRow(row: Record<string, unknown>): TaskRow {
  const id = String(row['id'] ?? '');
  const status = (row['status'] as TaskRow['status']) || 'Backlog';
  const priority = (row['priority'] as TaskRow['priority']) || 'Low';
  const assignedTo = formatDisplayPerson(String(row['assignedTo'] ?? ''));
  return {
    id,
    title: inboundTitle(String(row['title'] ?? '')) || 'Task',
    description: inboundDescription(String(row['description'] ?? '')),
    status,
    priority,
    dueDate: String(row['dueDate'] ?? ''),
    dueDateRaw: String(row['dueDateRaw'] ?? ''),
    assignedTo,
    assignedInitials: String(row['assignedInitials'] ?? ''),
    lastModified: String(row['lastModified'] ?? ''),
  };
}

export function normalizeNoteRow(row: Record<string, unknown>): NoteRow {
  const id = String(row['id'] ?? '');
  const title = inboundTitle(String(row['title'] ?? '')) || 'Note';
  const author = formatDisplayPerson(String(row['author'] ?? ''));
  const when = String(row['when'] ?? '');

  if (row['relatedType'] != null && row['body'] != null) {
    const body = inboundDescription(String(row['body']));
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
      assignedBy: formatDisplayPerson(
        row['assignedBy'] != null ? String(row['assignedBy']) : author,
      ),
      when,
      bodyPreview,
    };
  }

  const record = String(row['record'] ?? '');
  const parsed = parseLegacyNoteRecord(record);
  const body = inboundDescription(String(row['bodyStorage'] ?? row['body'] ?? ''));
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
    assignedBy: formatDisplayPerson(
      row['assignedBy'] != null ? String(row['assignedBy']) : author,
    ),
    when,
    bodyPreview,
  };
}
