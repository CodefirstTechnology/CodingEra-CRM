/**

 * Centralized TextFormatter / Normalizer for CodingEra CRM.

 *

 * Apply before Create, Update, Import, Bulk Edit, and API submission.

 * Never format passwords, tokens, API keys, or uploaded file names.

 *

 * For ambiguous `name` fields, use {@link TextFormatter.entity} with an entity type

 * (Lead → person, Organization → company, Industry → master, etc.).

 */



import {

  formatAddress,

  formatByKind,

  formatCompanyName,

  formatCurrency,

  formatDate,

  formatDescription,

  formatEmail,

  formatField,

  formatGender,

  formatGstin,

  formatIndustry,

  formatItemGroup,

  formatMobile,

  formatPercentage,

  formatPersonName,

  formatRequirement,

  formatRole,

  formatSearch,

  formatStatus,

  formatTerritory,

  formatTitle,

  formatUrl,

  formatWebsite,

  type FormatResult,

} from './text-formatters';

import { normalizeFormGroup, normalizeFormValue } from './form-normalize';

import { normalizePayload, normalizeValue, type FieldSchema } from './normalize-payload';

import {

  formatEntityName,

  formatMasterName,

  normalizeEntity,

  normalizeEntityName,

  nameCategoryForEntity,

  entityNameFieldSchema,

} from './normalize-entity';

import {

  COMPANY_NAME_ENTITIES,

  MASTER_NAME_ENTITIES,

  PERSON_NAME_ENTITIES,

  PRODUCT_NAME_ENTITIES,

  resolveCrmEntityType,

  type CrmEntityType,

  type EntityNameCategory,

} from './entity-types';

import {

  CRM_FIELD_KIND_BY_KEY,

  FIELD_MAX_LENGTH,

  resolveFieldKind,

  type FieldKind,

} from './text-field-types';

import { isProtectedKey, NEVER_NORMALIZE_KEYS } from './text-sanitize';

import {
  inboundAddress,
  inboundCompany,
  inboundDescription,
  inboundEmail,
  inboundEntityName,
  inboundGender,
  inboundMaster,
  inboundMobile,
  inboundPerson,
  inboundTitle,
  inboundWebsite,
} from './inbound-format';

import type { FormGroup } from '@angular/forms';



export class TextFormatter {

  static readonly maxLength = FIELD_MAX_LENGTH;

  static readonly fieldKinds = CRM_FIELD_KIND_BY_KEY;

  static readonly protectedKeys = NEVER_NORMALIZE_KEYS;

  static readonly personEntities = PERSON_NAME_ENTITIES;

  static readonly companyEntities = COMPANY_NAME_ENTITIES;

  static readonly masterEntities = MASTER_NAME_ENTITIES;

  static readonly productEntities = PRODUCT_NAME_ENTITIES;



  static kindFor(key: string): FieldKind | null {

    return resolveFieldKind(key);

  }



  static isProtected(key: string): boolean {

    return isProtectedKey(key);

  }



  static resolveEntity(type: string | CrmEntityType): CrmEntityType {

    return resolveCrmEntityType(type);

  }



  static nameCategory(entityType: string | CrmEntityType): EntityNameCategory {

    return nameCategoryForEntity(entityType);

  }



  static byKind(kind: FieldKind, raw: unknown): FormatResult<string | number | null> {

    return formatByKind(kind, raw);

  }



  static field(kind: FieldKind, raw: unknown): string {

    return formatField(kind, raw);

  }



  static personName(v: string | null | undefined): string {

    return formatPersonName(v).value;

  }

  static companyName(v: string | null | undefined): string {

    return formatCompanyName(v).value;

  }

  static masterName(v: string | null | undefined): string {

    return formatMasterName(v).value;

  }

  /** Entity-aware formatting for a generic `name` value. */

  static entityName(entityType: string | CrmEntityType, v: string | null | undefined): string {

    return formatEntityName(entityType, v);

  }

  static email(v: string | null | undefined): string {

    return formatEmail(v).value;

  }

  static website(v: string | null | undefined): string {

    return formatWebsite(v).value;

  }

  static url(v: string | null | undefined): string {

    return formatUrl(v).value;

  }

  static mobile(v: string | null | undefined): string {

    return formatMobile(v).value;

  }

  static gstin(v: string | null | undefined): string {

    return formatGstin(v).value;

  }

  static currency(v: string | null | undefined): FormatResult {

    return formatCurrency(v);

  }

  static itemGroup(v: string | null | undefined): string {

    return formatItemGroup(v).value;

  }

  static address(v: string | null | undefined): string {

    return formatAddress(v).value;

  }

  static requirement(v: string | null | undefined): string {

    return formatRequirement(v).value;

  }

  static description(v: string | null | undefined): string {

    return formatDescription(v).value;

  }

  static title(v: string | null | undefined): string {

    return formatTitle(v).value;

  }

  static territory(v: string | null | undefined): string {

    return formatTerritory(v).value;

  }

  static industry(v: string | null | undefined): string {

    return formatIndustry(v).value;

  }

  static status(v: string | null | undefined): string {

    return formatStatus(v).value;

  }

  static role(v: string | null | undefined): FormatResult {

    return formatRole(v);

  }

  static gender(v: string | null | undefined): string {

    return formatGender(v).value;

  }

  static percentage(v: string | number | null | undefined): FormatResult<number | null> {

    return formatPercentage(v);

  }

  static date(v: string | null | undefined): FormatResult {

    return formatDate(v);

  }

  static search(v: string | null | undefined): string {

    return formatSearch(v).value;

  }



  /** Normalize known CRM fields on an API / form payload object. */

  static payload<T extends Record<string, unknown>>(

    data: T,

    schema?: FieldSchema,

  ): T {

    return normalizePayload(data, { schema, onlyKnownFields: true });

  }



  /**

   * Entity-aware payload normalization — routes generic `name` by entity type.

   * @example TextFormatter.entity('lead', { name: 'MR SAWANT', email: ' A@B.COM ' })

   */

  static entity<T extends Record<string, unknown>>(

    entityType: string | CrmEntityType,

    data: T,

    schema?: FieldSchema,

  ): T {

    return normalizeEntity(entityType, data, { schema, onlyKnownFields: true });

  }



  /** In-place Reactive Forms normalization before validation. */

  static form(form: FormGroup, schema?: FieldSchema): void {

    normalizeFormGroup(form, { schema });

  }



  /**

   * Form normalize with entity context so a control named `name` is formatted correctly.

   */

  static formForEntity(

    form: FormGroup,

    entityType: string | CrmEntityType,

    schema?: FieldSchema,

  ): void {

    normalizeFormGroup(form, {

      schema: { ...entityNameFieldSchema(entityType), ...(schema ?? {}) },

    });

  }



  /** Non-mutating snapshot of getRawValue(). */

  static formValue<T extends Record<string, unknown>>(raw: T, schema?: FieldSchema): T {

    return normalizeFormValue(raw, schema);

  }



  static value(kind: FieldKind, raw: unknown): FormatResult<string | number | null> {

    return normalizeValue(kind, raw);

  }

}



export type { FieldKind, FieldSchema, FormatResult, CrmEntityType, EntityNameCategory };

export {

  FIELD_MAX_LENGTH,

  CRM_FIELD_KIND_BY_KEY,

  resolveFieldKind,

  normalizePayload,

  normalizeFormGroup,

  normalizeFormValue,

  normalizeEntity,

  normalizeEntityName,

  formatEntityName,

  formatMasterName,

  nameCategoryForEntity,

  entityNameFieldSchema,

  resolveCrmEntityType,

  PERSON_NAME_ENTITIES,

  COMPANY_NAME_ENTITIES,

  MASTER_NAME_ENTITIES,

  PRODUCT_NAME_ENTITIES,

  formatByKind,

  formatField,

  formatPersonName,

  formatCompanyName,

  formatEmail,

  formatWebsite,

  formatUrl,

  formatMobile,

  formatGstin,

  formatCurrency,

  formatItemGroup,

  formatAddress,

  formatRequirement,

  formatDescription,

  formatTitle,

  formatTerritory,

  formatIndustry,

  formatStatus,

  formatRole,

  formatGender,

  formatPercentage,

  formatDate,

  formatSearch,

  isProtectedKey,

  NEVER_NORMALIZE_KEYS,

  inboundPerson,

  inboundCompany,

  inboundMaster,

  inboundEntityName,

  inboundEmail,

  inboundMobile,

  inboundWebsite,

  inboundTitle,

  inboundDescription,

  inboundGender,

  inboundAddress,

};


