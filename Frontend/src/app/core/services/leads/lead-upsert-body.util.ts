import type { LeadUpsertDto } from './lead-api.models';

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
    notes: dto.notes?.trim() || '',
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
  if (dto.organizationId != null && dto.organizationId > 0) {
    body['organizationId'] = dto.organizationId;
  }
  if (dto.requestTypeId != null && dto.requestTypeId > 0) {
    body['requestTypeId'] = dto.requestTypeId;
  }
  if (dto.salutationId != null && dto.salutationId > 0) {
    body['salutationId'] = dto.salutationId;
  }
  if (dto.gender?.trim()) {
    body['gender'] = dto.gender.trim();
  }

  return body;
}
