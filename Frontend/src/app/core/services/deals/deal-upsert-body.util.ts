import type { DealNormalized, DealUpsertDto } from './deal-api.models';

const DEFAULT_DEAL_GENDER = 'Other';

/** Backend rejects null `NextStep`; use empty string when unset. */
function normalizeNextStep(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

/**
 * Builds JSON for `POST /api/deals` matching ASP.NET validation:
 * omit `id: 0`, avoid explicit null FKs, and always send `nextStep`.
 */
export function stripDealUpsertForPost(dto: DealUpsertDto): Record<string, unknown> {
  const body: Record<string, unknown> = {
    organizationName: dto.organizationName?.trim() || '',
    salutation: dto.salutation?.trim() || '',
    firstName: dto.firstName?.trim() || 'Contact',
    lastName: dto.lastName?.trim() || 'Primary',
    email: dto.email?.trim() || '',
    mobile: dto.mobile?.trim() || '',
    gender: dto.gender?.trim() || DEFAULT_DEAL_GENDER,
    employees: dto.employees?.trim() || '1-10',
    website: dto.website?.trim() || '',
    territory: dto.territory?.trim() || '',
    industry: dto.industry?.trim() || 'Technology',
    status: dto.status?.trim() || 'Qualification',
    assignedInitials: dto.assignedInitials?.trim() || '',
    nextStep: normalizeNextStep(dto.nextStep),
  };

  if (dto.annualRevenue != null && Number.isFinite(dto.annualRevenue)) {
    body['annualRevenue'] = dto.annualRevenue;
  }

  const prob = dto.probabilityPercent;
  if (prob != null && Number.isFinite(prob)) {
    body['probabilityPercent'] = Math.trunc(Math.round(prob));
  }

  if (dto.dealOwnerId != null && dto.dealOwnerId > 0) {
    body['dealOwnerId'] = dto.dealOwnerId;
  }
  if (dto.assignedToUserId != null && dto.assignedToUserId > 0) {
    body['assignedToUserId'] = dto.assignedToUserId;
  }

  const orgNm = dto.organizationName?.trim() || '';
  if (dto.organizationId != null && dto.organizationId > 0) {
    body['organizationId'] = dto.organizationId;
    if (orgNm) body['organizationName'] = orgNm;
  } else if (orgNm) {
    body['organizationName'] = orgNm;
  }

  if (dto.contactId != null && dto.contactId > 0) {
    body['contactId'] = dto.contactId;
  }
  if (dto.relatedContactId != null && dto.relatedContactId > 0) {
    body['relatedContactId'] = dto.relatedContactId;
  }
  if (dto.relatedOrganizationId != null && dto.relatedOrganizationId > 0) {
    body['relatedOrganizationId'] = dto.relatedOrganizationId;
  }

  return body;
}

/** Builds JSON for `PUT /api/deals/{id}` with route/body id alignment. */
export function buildDealPutJson(dto: DealUpsertDto, previous: DealNormalized): Record<string, unknown> {
  const dealId = dto.id > 0 ? dto.id : previous.id;
  const body: Record<string, unknown> = {
    id: dealId,
    organizationName: dto.organizationName?.trim() || previous.organizationName?.trim() || '',
    salutation: dto.salutation?.trim() ?? previous.salutation ?? '',
    firstName: dto.firstName?.trim() || previous.firstName?.trim() || 'Contact',
    lastName: dto.lastName?.trim() || previous.lastName?.trim() || 'Primary',
    email: dto.email?.trim() ?? previous.email ?? '',
    mobile: dto.mobile?.trim() ?? previous.mobile ?? '',
    gender: dto.gender?.trim() || previous.gender?.trim() || DEFAULT_DEAL_GENDER,
    employees: dto.employees?.trim() || previous.employees?.trim() || '1-10',
    website: dto.website?.trim() ?? previous.website ?? '',
    territory: dto.territory?.trim() ?? previous.territory ?? '',
    industry: dto.industry?.trim() || previous.industry?.trim() || 'Technology',
    status: dto.status?.trim() || previous.status?.trim() || 'Qualification',
    assignedInitials: dto.assignedInitials?.trim() ?? previous.assignedInitials ?? '',
    nextStep: normalizeNextStep(dto.nextStep ?? previous.nextStep),
  };

  const annual = dto.annualRevenue ?? previous.annualRevenue;
  if (annual != null && Number.isFinite(annual)) {
    body['annualRevenue'] = annual;
  }

  const prob = dto.probabilityPercent ?? previous.probabilityPercent;
  if (prob != null && Number.isFinite(prob)) {
    body['probabilityPercent'] = Math.trunc(Math.round(prob));
  }

  const orgId =
    dto.organizationId != null && dto.organizationId > 0
      ? dto.organizationId
      : previous.organizationId != null && previous.organizationId > 0
        ? previous.organizationId
        : null;
  const orgNm = dto.organizationName?.trim() || previous.organizationName?.trim() || '';
  if (orgId != null && orgId > 0) {
    body['organizationId'] = orgId;
    if (orgNm) body['organizationName'] = orgNm;
  } else if (orgNm) {
    body['organizationName'] = orgNm;
  }

  const contactId =
    dto.contactId != null && dto.contactId > 0
      ? dto.contactId
      : previous.contactId != null && previous.contactId > 0
        ? previous.contactId
        : null;
  if (contactId != null && contactId > 0) {
    body['contactId'] = contactId;
  }

  const ownerId =
    dto.dealOwnerId != null && dto.dealOwnerId > 0
      ? dto.dealOwnerId
      : previous.dealOwnerId != null && previous.dealOwnerId > 0
        ? previous.dealOwnerId
        : null;
  if (ownerId != null && ownerId > 0) {
    body['dealOwnerId'] = ownerId;
  } else if (dto.dealOwnerId === null) {
    body['dealOwnerId'] = null;
  }

  const assigneeId =
    dto.assignedToUserId != null && dto.assignedToUserId > 0
      ? dto.assignedToUserId
      : previous.assignedToUserId != null && previous.assignedToUserId > 0
        ? previous.assignedToUserId
        : ownerId;
  if (assigneeId != null && assigneeId > 0) {
    body['assignedToUserId'] = assigneeId;
  } else if (dto.assignedToUserId === null) {
    body['assignedToUserId'] = null;
  }

  const relatedContactId =
    dto.relatedContactId != null && dto.relatedContactId > 0
      ? dto.relatedContactId
      : previous.relatedContactId;
  if (relatedContactId != null && relatedContactId > 0) {
    body['relatedContactId'] = relatedContactId;
  }

  const relatedOrganizationId =
    dto.relatedOrganizationId != null && dto.relatedOrganizationId > 0
      ? dto.relatedOrganizationId
      : previous.relatedOrganizationId;
  if (relatedOrganizationId != null && relatedOrganizationId > 0) {
    body['relatedOrganizationId'] = relatedOrganizationId;
  }

  return body;
}
