import { TextFormatter } from '../../../shared/utils/text-normalizer';
import { composeLeadNotesForApi } from './lead-notes-requirement.util';
import type { LeadNormalized, LeadUpsertDto } from './lead-api.models';

function notesForApiPayload(dto: LeadUpsertDto, previous?: LeadNormalized): string {
  const requirement = dto.requirement != null ? TextFormatter.requirement(dto.requirement) : dto.requirement;
  const notes = dto.notes != null ? TextFormatter.description(dto.notes) : dto.notes;
  return (
    composeLeadNotesForApi(requirement, notes) ||
    (notes?.trim() ? TextFormatter.description(notes) : '') ||
    previous?.notes?.trim() ||
    ''
  );
}

function normPerson(v: string | null | undefined, fallback = ''): string {
  const n = TextFormatter.personName(v);
  return n || fallback;
}

function normEmail(v: string | null | undefined): string {
  return TextFormatter.email(v);
}

function normMobile(v: string | null | undefined): string {
  return TextFormatter.mobile(v);
}

function normGender(v: string | null | undefined, fallback: string): string {
  return TextFormatter.gender(v) || fallback;
}

function normCompany(v: string | null | undefined): string {
  return TextFormatter.companyName(v);
}

function normStatus(v: string | null | undefined): string {
  return TextFormatter.status(v);
}

function normAddress(v: string | null | undefined): string {
  return TextFormatter.address(v);
}

function normDate(v: string | null | undefined): string {
  return TextFormatter.date(v).value;
}

/** Backend marks `Gender` as required on PUT; marketplace imports often have none. */
const DEFAULT_LEAD_GENDER = 'Other';

/**
 * Builds JSON for `PUT /api/leads/{id}` with required fields filled from the loaded row.
 * Includes `id` — many ASP.NET APIs validate that the body id matches the route id.
 */
export function buildLeadPutJson(dto: LeadUpsertDto, previous: LeadNormalized): Record<string, unknown> {
  const gender = normGender(dto.gender, '') || normGender(previous.gender, '') || DEFAULT_LEAD_GENDER;

  const leadId = dto.id > 0 ? dto.id : previous.id;

  const body: Record<string, unknown> = {
    id: leadId,
    firstName: normPerson(dto.firstName) || normPerson(previous.firstName, 'Lead') || 'Lead',
    lastName: normPerson(dto.lastName) || normPerson(previous.lastName, 'Contact') || 'Contact',
    email: dto.email !== undefined ? normEmail(dto.email) : normEmail(previous.email),
    mobile: dto.mobile !== undefined ? normMobile(dto.mobile) : normMobile(previous.mobile),
    gender,
    notes: notesForApiPayload(dto, previous),
    leadSource: dto.leadSource?.trim() || previous.leadSource?.trim() || 'Website',
  };

  if (dto.salutationId != null && dto.salutationId > 0) {
    body['salutationId'] = dto.salutationId;
  } else if (previous.salutationId != null && previous.salutationId > 0) {
    body['salutationId'] = previous.salutationId;
  }

  const dtoOrgNm = normCompany(dto.organizationName);
  const prevOrgNm = normCompany(previous.organizationName);

  const orgId =
    dto.organizationId != null && dto.organizationId > 0
      ? dto.organizationId
      : previous.organizationId != null && previous.organizationId > 0
        ? previous.organizationId
        : null;
  const orgNm = dtoOrgNm || prevOrgNm;
  if (orgId != null && orgId > 0) {
    body['organizationId'] = orgId;
    if (orgNm) body['organizationName'] = orgNm;
  } else if (orgNm) {
    body['organizationName'] = orgNm;
  }
  // Never send organizationId: 0 or null — backend treats 0 as "clear FK".

  if (dto.leadStatusId != null && dto.leadStatusId > 0) {
    body['leadStatusId'] = dto.leadStatusId;
  } else if (previous.leadStatusId != null && previous.leadStatusId > 0) {
    body['leadStatusId'] = previous.leadStatusId;
  } else if (dto.status?.trim()) {
    body['status'] = normStatus(dto.status);
  } else if (previous.statusName?.trim()) {
    body['status'] = normStatus(previous.statusName);
  }

  if (dto.requestTypeId != null && dto.requestTypeId > 0) {
    body['requestTypeId'] = dto.requestTypeId;
  } else if (previous.requestTypeId != null && previous.requestTypeId > 0) {
    body['requestTypeId'] = previous.requestTypeId;
  }

  if (dto.leadOwnerId != null && dto.leadOwnerId > 0) {
    body['leadOwnerId'] = dto.leadOwnerId;
  } else if (dto.leadOwnerId === null) {
    body['leadOwnerId'] = null;
  }

  if (dto.createdAt) {
    body['createdAt'] = dto.createdAt;
  } else if (previous.createdAt) {
    body['createdAt'] = previous.createdAt;
  }

  const location = normAddress(dto.location) || normAddress(previous.location);
  body['location'] = location;

  const leadDate = normDate(dto.leadDate) || normDate(previous.leadDate);
  if (leadDate) {
    body['leadDate'] = leadDate;
  }

  const dealAmount = dto.dealAmount ?? previous.dealAmount;
  if (dealAmount != null && Number.isFinite(dealAmount)) {
    body['dealAmount'] = dealAmount;
  }

  return body;
}

/**
 * Builds JSON for `POST /api/leads` that matches typical ASP.NET validation:
 * no `id: 0`, no explicit null FKs, and `leadStatusId` when available.
 */
export function stripLeadUpsertForPost(dto: LeadUpsertDto): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: normPerson(dto.firstName, 'Lead') || 'Lead',
    lastName: normPerson(dto.lastName, 'Contact') || 'Contact',
    email: normEmail(dto.email),
    mobile: normMobile(dto.mobile),
    notes: notesForApiPayload(dto),
    leadSource: dto.leadSource?.trim() || 'Website',
  };

  if (dto.leadStatusId != null && dto.leadStatusId > 0) {
    body['leadStatusId'] = dto.leadStatusId;
  } else if (dto.status?.trim()) {
    body['status'] = normStatus(dto.status);
  }

  if (dto.leadOwnerId != null && dto.leadOwnerId > 0) {
    body['leadOwnerId'] = dto.leadOwnerId;
  }
  const orgNm = normCompany(dto.organizationName);
  if (dto.organizationId != null && dto.organizationId > 0) {
    body['organizationId'] = dto.organizationId;
    if (orgNm) body['organizationName'] = orgNm;
  } else if (dto.organizationId === null) {
    body['organizationId'] = null;
  } else if (orgNm) {
    body['organizationName'] = orgNm;
  }
  if (dto.requestTypeId != null && dto.requestTypeId > 0) {
    body['requestTypeId'] = dto.requestTypeId;
  }
  if (dto.salutationId != null && dto.salutationId > 0) {
    body['salutationId'] = dto.salutationId;
  }
  body['gender'] = normGender(dto.gender, DEFAULT_LEAD_GENDER);

  const location = normAddress(dto.location);
  if (location) {
    body['location'] = location;
  }

  const leadDate = normDate(dto.leadDate);
  if (leadDate) {
    body['leadDate'] = leadDate;
  }

  if (dto.dealAmount != null && Number.isFinite(dto.dealAmount)) {
    body['dealAmount'] = dto.dealAmount;
  }

  return body;
}
