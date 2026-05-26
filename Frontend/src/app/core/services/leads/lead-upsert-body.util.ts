import { composeLeadNotesForApi } from './lead-notes-requirement.util';
import type { LeadNormalized, LeadUpsertDto } from './lead-api.models';

function notesForApiPayload(dto: LeadUpsertDto, previous?: LeadNormalized): string {
  return (
    composeLeadNotesForApi(dto.requirement, dto.notes) ||
    dto.notes?.trim() ||
    previous?.notes?.trim() ||
    ''
  );
}

/** Backend marks `Gender` as required on PUT; marketplace imports often have none. */
const DEFAULT_LEAD_GENDER = 'Other';

/**
 * Builds JSON for `PUT /api/leads/{id}` with required fields filled from the loaded row.
 * Includes `id` — many ASP.NET APIs validate that the body id matches the route id.
 */
export function buildLeadPutJson(dto: LeadUpsertDto, previous: LeadNormalized): Record<string, unknown> {
  const gender =
    dto.gender?.trim() || previous.gender?.trim() || DEFAULT_LEAD_GENDER;

  const leadId = dto.id > 0 ? dto.id : previous.id;

  const body: Record<string, unknown> = {
    id: leadId,
    firstName: dto.firstName?.trim() || previous.firstName?.trim() || 'Lead',
    lastName: dto.lastName?.trim() || previous.lastName?.trim() || 'Contact',
    email: dto.email?.trim() ?? previous.email ?? '',
    mobile: dto.mobile?.trim() ?? previous.mobile ?? '',
    gender,
    notes: notesForApiPayload(dto, previous),
    leadSource: dto.leadSource?.trim() || previous.leadSource?.trim() || 'Website',
  };

  if (dto.salutationId != null && dto.salutationId > 0) {
    body['salutationId'] = dto.salutationId;
  } else if (previous.salutationId != null && previous.salutationId > 0) {
    body['salutationId'] = previous.salutationId;
  }

  const dtoOrgNm = dto.organizationName?.trim() || '';
  const prevOrgNm = previous.organizationName?.trim() || '';

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
    body['status'] = dto.status.trim();
  } else if (previous.statusName?.trim()) {
    body['status'] = previous.statusName.trim();
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

  return body;
}

/**
 * Builds JSON for `POST /api/leads` that matches typical ASP.NET validation:
 * no `id: 0`, no explicit null FKs, and `leadStatusId` when available.
 */
export function stripLeadUpsertForPost(dto: LeadUpsertDto): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: dto.firstName?.trim() || 'Lead',
    lastName: dto.lastName?.trim() || 'Contact',
    email: dto.email?.trim() || '',
    mobile: dto.mobile?.trim() || '',
    notes: notesForApiPayload(dto),
    leadSource: dto.leadSource?.trim() || 'Website',
  };

  if (dto.leadStatusId != null && dto.leadStatusId > 0) {
    body['leadStatusId'] = dto.leadStatusId;
  } else if (dto.status?.trim()) {
    body['status'] = dto.status.trim();
  }

  if (dto.leadOwnerId != null && dto.leadOwnerId > 0) {
    body['leadOwnerId'] = dto.leadOwnerId;
  }
  const orgNm = dto.organizationName?.trim() || '';
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
  body['gender'] = dto.gender?.trim() || DEFAULT_LEAD_GENDER;

  return body;
}
