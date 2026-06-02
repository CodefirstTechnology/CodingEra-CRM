import type { DealRow } from '../../features/deals/deals.component';
import type { MasterDataOption } from '../../core/services/leads/lead-master-data.service';
import { masterSelectControlValue } from '../../core/services/organizations/organization-master-select.util';
import { parseRevenueInputToNumber } from './revenue-parse';

export const DEAL_QUOTATION_PREFILL_KEY = 'crm.quotation.dealPrefill';

export interface DealQuotationPrefill {
  dealId: number;
  salutation: string;
  firstName: string;
  lastName: string;
  gender: string;
  customerName: string;
  companyName: string;
  contactPerson: string;
  mobileNumber: string;
  emailAddress: string;
  employees: string;
  annualRevenue: string;
  website: string;
  gst: string;
  territory: string;
  industry: string;
  officeAddress: string;
  siteAddress: string;
  referenceNumber: string;
  organizationId?: number | null;
  salutationId?: number | null;
  employeeCountId?: number | null;
  territoryId?: number | null;
  industryId?: number | null;
  /** When set, used as-is for quotation &lt;select&gt; (from deal detail form controls). */
  formSalutationValue?: string;
  formTerritoryValue?: string;
  formEmployeesValue?: string;
  formIndustryValue?: string;
}

export interface DealQuotationPrefillFormSlice {
  organization?: string;
  email?: string;
  mobile?: string;
  website?: string;
  gst?: string;
  annualRevenue?: string;
  /** Master-data select control values from deal detail form (ids or labels). */
  territory?: string;
  employees?: string;
  industry?: string;
  salutation?: string;
}

export interface QuotationMasterSelectOptions {
  salutations: MasterDataOption[];
  employees: MasterDataOption[];
  territories: MasterDataOption[];
  industries: MasterDataOption[];
}

function clean(value: string | undefined | null): string {
  const v = (value ?? '').trim();
  return v === '—' ? '' : v;
}

function resolveDealOrganizationId(row: DealRow): number | null {
  for (const raw of [row.organizationId, row.relatedOrganizationId]) {
    const t = raw?.trim();
    if (!t) continue;
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}

export function buildDealQuotationPrefill(
  dealId: number,
  row: DealRow,
  form?: DealQuotationPrefillFormSlice,
  referenceNumber?: string,
): DealQuotationPrefill {
  const firstName = clean(row.firstName);
  const lastName = clean(row.lastName);
  const companyName = clean(form?.organization) || clean(row.organizationName);
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || companyName;
  const salutation = clean(row.salutation);
  const contactPerson =
    [salutation, firstName, lastName].filter(Boolean).join(' ').trim() || customerName;

  const organizationId = resolveDealOrganizationId(row);

  const rev = row.annualRevenue;
  const annualRevenue =
    rev != null && Number.isFinite(rev) && rev > 0
      ? rev.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';

  const formTerritory = clean(form?.territory);
  const formEmployees = clean(form?.employees);
  const formIndustry = clean(form?.industry);
  const formSalutation = clean(form?.salutation);

  return {
    dealId,
    salutation: formSalutation || salutation,
    firstName,
    lastName,
    gender: clean(row.gender),
    customerName,
    companyName,
    contactPerson,
    mobileNumber: clean(form?.mobile) || clean(row.mobile),
    emailAddress: clean(form?.email) || clean(row.email),
    employees: formEmployees || clean(row.employees),
    annualRevenue: clean(form?.annualRevenue) || annualRevenue,
    website: clean(form?.website) || clean(row.website),
    gst: clean(form?.gst) || clean(row.gst),
    territory: formTerritory || clean(row.territory),
    industry: formIndustry || clean(row.industry),
    formSalutationValue: formSalutation || undefined,
    formTerritoryValue: formTerritory || undefined,
    formEmployeesValue: formEmployees || undefined,
    formIndustryValue: formIndustry || undefined,
    officeAddress: '',
    siteAddress: '',
    referenceNumber: referenceNumber?.trim() ?? '',
    organizationId,
    salutationId: row.salutationId ?? null,
    employeeCountId: row.employeeCountId ?? null,
    territoryId: row.territoryId ?? null,
    industryId: row.industryId ?? null,
  };
}

export function storeDealQuotationPrefill(prefill: DealQuotationPrefill): void {
  try {
    sessionStorage.setItem(DEAL_QUOTATION_PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    /* ignore */
  }
}

export function consumeDealQuotationPrefill(): DealQuotationPrefill | null {
  try {
    const raw = sessionStorage.getItem(DEAL_QUOTATION_PREFILL_KEY);
    sessionStorage.removeItem(DEAL_QUOTATION_PREFILL_KEY);
    if (!raw) return null;
    return parsePrefillJson(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function readDealQuotationPrefillFromNavigation(): DealQuotationPrefill | null {
  const raw = history.state?.['dealPrefill'];
  if (raw == null || typeof raw !== 'object') return null;
  return parsePrefillJson(raw as Record<string, unknown>);
}

function parsePrefillJson(o: Record<string, unknown>): DealQuotationPrefill | null {
  const dealId = Number(o['dealId']);
  if (!Number.isFinite(dealId) || dealId <= 0) return null;
  return {
    dealId,
    salutation: String(o['salutation'] ?? ''),
    firstName: String(o['firstName'] ?? ''),
    lastName: String(o['lastName'] ?? ''),
    gender: String(o['gender'] ?? ''),
    customerName: String(o['customerName'] ?? ''),
    companyName: String(o['companyName'] ?? ''),
    contactPerson: String(o['contactPerson'] ?? ''),
    mobileNumber: String(o['mobileNumber'] ?? ''),
    emailAddress: String(o['emailAddress'] ?? ''),
    employees: String(o['employees'] ?? ''),
    annualRevenue: String(o['annualRevenue'] ?? ''),
    website: String(o['website'] ?? ''),
    gst: String(o['gst'] ?? ''),
    territory: String(o['territory'] ?? ''),
    industry: String(o['industry'] ?? ''),
    officeAddress: String(o['officeAddress'] ?? ''),
    siteAddress: String(o['siteAddress'] ?? ''),
    referenceNumber: String(o['referenceNumber'] ?? ''),
    organizationId:
      o['organizationId'] != null && Number(o['organizationId']) > 0
        ? Number(o['organizationId'])
        : null,
    salutationId:
      o['salutationId'] != null && Number(o['salutationId']) > 0 ? Number(o['salutationId']) : null,
    employeeCountId:
      o['employeeCountId'] != null && Number(o['employeeCountId']) > 0
        ? Number(o['employeeCountId'])
        : null,
    territoryId:
      o['territoryId'] != null && Number(o['territoryId']) > 0 ? Number(o['territoryId']) : null,
    industryId:
      o['industryId'] != null && Number(o['industryId']) > 0 ? Number(o['industryId']) : null,
  };
}

export function prefillToFormPatch(
  p: DealQuotationPrefill,
  masters?: QuotationMasterSelectOptions,
): Record<string, unknown> {
  const salutation =
    p.formSalutationValue?.trim() ||
    (masters != null
      ? masterSelectControlValue(p.salutationId, p.salutation, masters.salutations)
      : p.salutation);
  const employees =
    p.formEmployeesValue?.trim() ||
    (masters != null
      ? masterSelectControlValue(p.employeeCountId, p.employees, masters.employees)
      : p.employees);
  const territory =
    p.formTerritoryValue?.trim() ||
    (masters != null
      ? masterSelectControlValue(p.territoryId, p.territory, masters.territories)
      : p.territory);
  const industry =
    p.formIndustryValue?.trim() ||
    (masters != null
      ? masterSelectControlValue(p.industryId, p.industry, masters.industries)
      : p.industry);

  return {
    dealId: p.dealId,
    salutation,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    customerName: p.customerName,
    companyName: p.companyName,
    contactPerson: p.contactPerson,
    mobileNumber: p.mobileNumber,
    emailAddress: p.emailAddress,
    employees,
    annualRevenue: p.annualRevenue,
    website: p.website,
    gst: p.gst,
    territory,
    industry,
    officeAddress: p.officeAddress,
    siteAddress: p.siteAddress,
    referenceNumber: p.referenceNumber,
    referenceDate: '',
  };
}

export function revenueStringToNumber(raw: string): number | null {
  return parseRevenueInputToNumber(raw?.trim() ?? '');
}
