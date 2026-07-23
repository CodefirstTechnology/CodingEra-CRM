/**
 * Inbound (API → UI) formatting helpers.
 * Use these in every map*ApiRecord / normalize*ApiRecord so display data is already clean.
 */
import type { CrmEntityType } from './entity-types';
import { formatEntityName } from './normalize-entity';
import {
  formatAddress,
  formatDescription,
  formatEmail,
  formatGender,
  formatMobile,
  formatPersonName,
  formatTitle,
  formatWebsite,
} from './text-formatters';

/** Person / contact / actor display names. */
export function inboundPerson(raw: string | null | undefined): string {
  return formatPersonName(raw).value;
}

/** Organization / company / brand names. */
export function inboundCompany(raw: string | null | undefined): string {
  return formatEntityName('organization', raw);
}

/** Master / catalog / status / role / industry labels. */
export function inboundMaster(
  entityType: CrmEntityType | string,
  raw: string | null | undefined,
): string {
  return formatEntityName(entityType, raw);
}

/** Generic entity-aware `name` (Lead → person, Org → company, etc.). */
export function inboundEntityName(
  entityType: CrmEntityType | string,
  raw: string | null | undefined,
): string {
  return formatEntityName(entityType, raw);
}

export function inboundEmail(raw: string | null | undefined): string {
  return formatEmail(raw).value;
}

export function inboundMobile(raw: string | null | undefined): string {
  return formatMobile(raw).value;
}

export function inboundWebsite(raw: string | null | undefined): string {
  return formatWebsite(raw).value;
}

export function inboundTitle(raw: string | null | undefined): string {
  return formatTitle(raw).value;
}

export function inboundDescription(raw: string | null | undefined): string {
  return formatDescription(raw).value;
}

export function inboundGender(raw: string | null | undefined): string {
  return formatGender(raw).value;
}

export function inboundAddress(raw: string | null | undefined): string {
  return formatAddress(raw).value;
}
