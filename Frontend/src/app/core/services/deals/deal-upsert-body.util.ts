import type { DealNormalized, DealUpsertDto } from './deal-api.models';
import { TextFormatter } from '../../../shared/utils/text-normalizer';
import { DEFAULT_DEAL_PIPELINE_STATUS } from './deal-pipeline.constants';

const DEFAULT_DEAL_GENDER = 'Other';

/** Backend rejects null `NextStep`; use empty string when unset. */
function normalizeNextStep(value: string | null | undefined): string {
  return TextFormatter.description(value ?? '');
}

/**
 * Builds JSON for `POST /api/deals` matching ASP.NET validation:
 * omit `id: 0`, avoid explicit null FKs, and always send `nextStep`.
 */
export function stripDealUpsertForPost(dto: DealUpsertDto): Record<string, unknown> {
  const body: Record<string, unknown> = {
    organizationName: TextFormatter.companyName(dto.organizationName),
    salutation: TextFormatter.personName(dto.salutation),
    firstName: TextFormatter.personName(dto.firstName) || 'Contact',
    lastName: TextFormatter.personName(dto.lastName) || 'Primary',
    email: TextFormatter.email(dto.email),
    mobile: TextFormatter.mobile(dto.mobile),
    gender: TextFormatter.gender(dto.gender) || DEFAULT_DEAL_GENDER,
    employees: dto.employees?.trim() || '1-10',
    website: TextFormatter.website(dto.website),
    gst: TextFormatter.gstin(dto.gst),
    territory: TextFormatter.territory(dto.territory),
    industry: TextFormatter.industry(dto.industry) || 'Technology',
    status: TextFormatter.status(dto.status) || DEFAULT_DEAL_PIPELINE_STATUS,
    assignedInitials: dto.assignedInitials?.trim() || '',
    nextStep: normalizeNextStep(dto.nextStep),
  };

  if (dto.dealStatusId != null && dto.dealStatusId > 0) {
    body['dealStatusId'] = dto.dealStatusId;
  }

  if (dto.annualRevenue != null && Number.isFinite(dto.annualRevenue)) {
    body['annualRevenue'] = dto.annualRevenue;
  }

  if (dto.dealAmount != null && Number.isFinite(dto.dealAmount)) {
    body['dealAmount'] = dto.dealAmount;
  }

  const prob = dto.probabilityPercent;
  if (prob != null && Number.isFinite(prob)) {
    const pct = TextFormatter.percentage(prob);
    if (pct.valid && pct.value != null) {
      body['probabilityPercent'] = Math.trunc(Math.round(pct.value));
    }
  }

  if (dto.dealOwnerId != null && dto.dealOwnerId > 0) {
    body['dealOwnerId'] = dto.dealOwnerId;
  }
  if (dto.assignedToUserId != null && dto.assignedToUserId > 0) {
    body['assignedToUserId'] = dto.assignedToUserId;
  }

  const orgNm = TextFormatter.companyName(dto.organizationName);
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
  const relatedOrgId =
    dto.relatedOrganizationId != null && dto.relatedOrganizationId > 0
      ? dto.relatedOrganizationId
      : dto.organizationId != null && dto.organizationId > 0
        ? dto.organizationId
        : null;
  if (relatedOrgId != null) {
    body['relatedOrganizationId'] = relatedOrgId;
  }

  return body;
}

/** Builds JSON for `PUT /api/deals/{id}` with route/body id alignment. */
export function buildDealPutJson(dto: DealUpsertDto, previous: DealNormalized): Record<string, unknown> {
  const dealId = dto.id > 0 ? dto.id : previous.id;
  const body: Record<string, unknown> = {
    id: dealId,
    organizationName:
      TextFormatter.companyName(dto.organizationName) ||
      TextFormatter.companyName(previous.organizationName),
    salutation: TextFormatter.personName(dto.salutation ?? previous.salutation),
    firstName:
      TextFormatter.personName(dto.firstName) ||
      TextFormatter.personName(previous.firstName) ||
      'Contact',
    lastName:
      TextFormatter.personName(dto.lastName) ||
      TextFormatter.personName(previous.lastName) ||
      'Primary',
    email: TextFormatter.email(dto.email) || TextFormatter.email(previous.email),
    mobile: TextFormatter.mobile(dto.mobile) || TextFormatter.mobile(previous.mobile),
    gender:
      TextFormatter.gender(dto.gender) ||
      TextFormatter.gender(previous.gender) ||
      DEFAULT_DEAL_GENDER,
    employees: dto.employees?.trim() || previous.employees?.trim() || '1-10',
    website: TextFormatter.website(dto.website ?? previous.website),
    gst: TextFormatter.gstin(dto.gst ?? previous.gst),
    territory: TextFormatter.territory(dto.territory ?? previous.territory),
    industry:
      TextFormatter.industry(dto.industry) ||
      TextFormatter.industry(previous.industry) ||
      'Technology',
    status:
      TextFormatter.status(dto.status) ||
      TextFormatter.status(previous.status) ||
      DEFAULT_DEAL_PIPELINE_STATUS,
    assignedInitials: dto.assignedInitials?.trim() ?? previous.assignedInitials ?? '',
    nextStep: normalizeNextStep(dto.nextStep ?? previous.nextStep),
  };

  const annual = dto.annualRevenue ?? previous.annualRevenue;
  if (annual != null && Number.isFinite(annual)) {
    body['annualRevenue'] = annual;
  }

  const dealAmount = dto.dealAmount ?? previous.dealAmount;
  if (dealAmount != null && Number.isFinite(dealAmount)) {
    body['dealAmount'] = dealAmount;
  }

  const prob = dto.probabilityPercent ?? previous.probabilityPercent;
  if (prob != null && Number.isFinite(prob)) {
    const pct = TextFormatter.percentage(prob);
    if (pct.valid && pct.value != null) {
      body['probabilityPercent'] = Math.trunc(Math.round(pct.value));
    }
  }

  const orgId =
    dto.organizationId != null && dto.organizationId > 0
      ? dto.organizationId
      : previous.organizationId != null && previous.organizationId > 0
        ? previous.organizationId
        : null;
  const orgNm =
    TextFormatter.companyName(dto.organizationName) ||
    TextFormatter.companyName(previous.organizationName);
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
      : dto.organizationId != null && dto.organizationId > 0
        ? dto.organizationId
        : previous.relatedOrganizationId != null && previous.relatedOrganizationId > 0
          ? previous.relatedOrganizationId
          : previous.organizationId != null && previous.organizationId > 0
            ? previous.organizationId
            : null;
  if (relatedOrganizationId != null && relatedOrganizationId > 0) {
    body['relatedOrganizationId'] = relatedOrganizationId;
  }

  return body;
}
