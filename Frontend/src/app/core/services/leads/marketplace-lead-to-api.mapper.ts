import { environment } from '../../../../environments/environment';
import { plainTextFromHtml } from '../../../shared/utils/plain-text-from-html';
import { coerceLeadStatus } from './lead-api.mapper';
import type { LeadRow, LeadSource, LeadStatus } from '../../../features/leads/lead-row.model';
import type { IndiaMartLead } from '../../../features/indiamartlead/indiamart-lead.model';
import type { JustdialLead } from '../../../features/justdiallead/justdial-lead.model';
import type { TradeIndiaLead } from '../../../features/tradeindialead/tradeindia-lead.model';
import { parseTradeIndiaInquiryMessage, looksLikePhoneNumber, resolveTradeIndiaCustomerName } from '../../../features/tradeindialead/tradeindia-inquiry-parse';
import {
  tradeIndiaOrganizationText,
  tradeIndiaRequirementText,
} from '../../../features/tradeindialead/tradeindia-lead.mapper';
import type { LeadUpsertDto } from './lead-api.models';
import { splitFullName } from '../../../features/leads/lead-full-name.util';

export type MarketplaceApiSource = Extract<LeadSource, 'IndiaMART' | 'Justdial' | 'TradeIndia'>;

interface MarketplaceLeadShape {
  customerName: string;
  mobile: string;
  email: string;
  city: string;
  companyName?: string;
  product: string;
  quantity: string;
  message: string;
  source: string;
  status: string;
  externalRef?: string;
  createdAt?: string;
}

export function marketplaceExternalRefMarker(source: MarketplaceApiSource, key: string): string {
  return `[crm-ext:${source}:${key.trim()}]`;
}

export function extractMarketplaceExternalRef(
  notes: string | null | undefined,
): { source: MarketplaceApiSource; key: string } | null {
  const m = String(notes ?? '').match(/\[crm-ext:(IndiaMART|Justdial|TradeIndia):([^\]]+)\]/);
  if (!m) return null;
  return { source: m[1] as MarketplaceApiSource, key: m[2].trim() };
}

function marketplaceRefKey(lead: MarketplaceLeadShape): string {
  const ext = lead.externalRef?.trim();
  if (ext) return ext;
  const email = lead.email.trim().toLowerCase();
  const mobile = lead.mobile.replace(/\D/g, '');
  return `${email}|${mobile}`;
}

export function marketplaceLeadDedupeKey(
  source: MarketplaceApiSource,
  lead: MarketplaceLeadShape,
): string {
  return `${source}|ext:${marketplaceRefKey(lead)}`;
}

/** Organization name stored in `/api/organizations` and linked via `organizationId` on the lead. */
export function marketplaceOrganizationName(
  lead: MarketplaceLeadShape,
  source?: MarketplaceApiSource,
): string {
  if (source === 'TradeIndia') {
    const company = tradeIndiaOrganizationText({
      companyName: lead.companyName ?? '',
      message: lead.message,
    });
    if (company) return company;
  }
  const product = lead.product.trim();
  if (product && product !== '-' && product !== '—') return product;
  const city = lead.city.trim();
  if (city && city !== '-' && city !== '—') return city;
  const customer = lead.customerName.trim();
  if (customer) return customer;
  return 'Marketplace lead';
}

/** Resolves org name from a lead upsert built by {@link toUpsertDto}. */
export function marketplaceOrganizationNameFromUpsert(dto: LeadUpsertDto): string {
  const parsed = parseMarketplaceNotesDisplay(dto.notes);
  const ext = extractMarketplaceExternalRef(dto.notes);
  if (ext?.source === 'TradeIndia') {
    if (parsed.company.trim()) return parsed.company.trim();
    const fromMessage = parseTradeIndiaInquiryMessage(parsed.message).companyName?.trim();
    if (fromMessage) return fromMessage;
  }
  if (ext?.source !== 'TradeIndia' && parsed.product.trim()) return parsed.product.trim();
  const fromLabel = parsed.organizationLabel.split(' (')[0]?.trim();
  if (fromLabel) return fromLabel;
  const fullName = `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim();
  return fullName || 'Marketplace lead';
}

export function marketplaceTerritoryFromUpsert(dto: LeadUpsertDto): string | undefined {
  const city = parseMarketplaceNotesDisplay(dto.notes).city.trim();
  return city || undefined;
}

function splitCustomerName(name: string): { firstName: string; lastName: string } {
  const { firstName, lastName } = splitFullName(name);
  return {
    firstName: firstName || 'Buyer',
    lastName,
  };
}

function buildNotes(source: MarketplaceApiSource, lead: MarketplaceLeadShape): string {
  const lines: string[] = [];
  if (source === 'TradeIndia') {
    const product = tradeIndiaRequirementText({ product: lead.product, message: lead.message });
    const company = tradeIndiaOrganizationText({
      companyName: lead.companyName ?? '',
      message: lead.message,
    });
    if (product) lines.push(`Product: ${product}`);
    if (company) lines.push(`Company: ${company}`);
    if (lead.city.trim() && lead.city.trim() !== '-') lines.push(`City: ${lead.city.trim()}`);
    if (lead.message.trim() && lead.message.trim() !== '-') lines.push(lead.message.trim());
    if (lead.source.trim()) lines.push(`Inquiry source: ${lead.source.trim()}`);
    lines.push(marketplaceExternalRefMarker(source, marketplaceRefKey(lead)));
    return lines.join('\n');
  }

  if (lead.message.trim()) lines.push(lead.message.trim());
  if (lead.product.trim()) {
    lines.push(`Product: ${lead.product.trim()}${lead.quantity.trim() ? ` · ${lead.quantity.trim()}` : ''}`);
  }
  if (lead.city.trim()) lines.push(`City: ${lead.city.trim()}`);
  if (lead.source.trim()) lines.push(`Inquiry source: ${lead.source.trim()}`);
  lines.push(marketplaceExternalRefMarker(source, marketplaceRefKey(lead)));
  return lines.join('\n');
}

/**
 * Value stored in the DB `leadSource` column (API often validates against allowed values like `Website`).
 * Platform name (IndiaMART / Justdial / TradeIndia) is kept in `notes` via `[crm-ext:…]`.
 */
function apiStoredLeadSourceField(): string {
  const v = (environment as { marketplaceLeadSourceForApi?: string }).marketplaceLeadSourceForApi;
  return v?.trim() || 'Website';
}

/** Inquiry text for IndiaMART → DB `requirement` column (not organization name). */
export function indiaMartRequirementText(lead: MarketplaceLeadShape): string {
  const message = plainTextFromHtml(lead.message);
  if (message) return message;
  const product = plainTextFromHtml(lead.product);
  if (!product) return '';
  const qty = lead.quantity.trim();
  const qtySuffix = qty && qty !== '—' ? ` · ${qty}` : '';
  return `${product}${qtySuffix}`;
}

/** Maps marketplace-only labels onto the six CRM `lead_statuses` names before API save. */
function crmMasterStatusFromMarketplace(raw: string | undefined): LeadStatus {
  const coerced = coerceLeadStatus(raw?.trim() || 'New');
  if (coerced === 'Converted') return 'Qualified';
  if (coerced === 'Lost') return 'Unqualified';
  return coerced;
}

function toUpsertDto(source: MarketplaceApiSource, lead: MarketplaceLeadShape): LeadUpsertDto {
  const resolvedName =
    source === 'TradeIndia'
      ? resolveTradeIndiaCustomerName({
          senderName: lead.customerName,
          companyName:
            lead.companyName ||
            tradeIndiaOrganizationText({
              companyName: lead.companyName ?? '',
              message: lead.message,
            }),
        })
      : lead.customerName;
  const { firstName, lastName } = splitCustomerName(resolvedName);
  const status = crmMasterStatusFromMarketplace(lead.status);

  return {
    id: 0,
    firstName,
    lastName,
    mobile: lead.mobile.trim() || '',
    email: lead.email.trim() || '',
    status,
    notes: buildNotes(source, lead),
    leadSource: apiStoredLeadSourceField(),
  };
}

/** Apply resolved `leadStatusId` before POST. */
export function withLeadStatusId(dto: LeadUpsertDto, leadStatusId: number | null): LeadUpsertDto {
  if (leadStatusId == null || leadStatusId <= 0) return dto;
  return { ...dto, leadStatusId, status: dto.status ?? 'New' };
}

export function indiaMartLeadToUpsertDto(lead: IndiaMartLead): LeadUpsertDto {
  const requirement = indiaMartRequirementText(lead);
  return {
    ...toUpsertDto('IndiaMART', lead),
    requirement: requirement || null,
    organizationId: null,
  };
}

export function justdialLeadToUpsertDto(lead: JustdialLead): LeadUpsertDto {
  return toUpsertDto('Justdial', lead);
}

export function tradeIndiaLeadToUpsertDto(lead: TradeIndiaLead): LeadUpsertDto {
  const requirement = tradeIndiaRequirementText(lead);
  return {
    ...toUpsertDto('TradeIndia', lead),
    requirement: requirement || null,
    organizationName: tradeIndiaOrganizationText(lead) || null,
  };
}

/** Parsed from marketplace import notes saved via {@link buildNotes}. */
export interface MarketplaceNotesDisplay {
  message: string;
  product: string;
  company: string;
  city: string;
  inquirySource: string;
  organizationLabel: string;
}

export function parseMarketplaceNotesDisplay(notes: string | null | undefined): MarketplaceNotesDisplay {
  const lines = String(notes ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const msgLines: string[] = [];
  let product = '';
  let company = '';
  let city = '';
  let inquirySource = '';

  for (const line of lines) {
    if (line.startsWith('[crm-ext:')) continue;
    const productMatch = line.match(/^Product:\s*(.+)$/i);
    const companyMatch = line.match(/^Company:\s*(.+)$/i);
    const cityMatch = line.match(/^City:\s*(.+)$/i);
    const inqMatch = line.match(/^Inquiry source:\s*(.+)$/i);
    if (productMatch) product = productMatch[1].trim();
    else if (companyMatch) company = companyMatch[1].trim();
    else if (cityMatch) city = cityMatch[1].trim();
    else if (inqMatch) inquirySource = inqMatch[1].trim();
    else msgLines.push(line);
  }

  const message = msgLines.join('\n').trim();
  const ext = extractMarketplaceExternalRef(notes);
  const fromBlob = parseTradeIndiaInquiryMessage(message);

  if (ext?.source === 'TradeIndia') {
    if (!product && fromBlob.product) product = fromBlob.product;
    if (!company && fromBlob.companyName) company = fromBlob.companyName;
    if (!city && fromBlob.city) city = fromBlob.city;
  }

  const organizationLabel =
    ext?.source === 'IndiaMART'
      ? product
        ? `${product}${city ? ` (${city})` : ''}`
        : city
      : ext?.source === 'TradeIndia'
        ? company || ''
        : product
          ? `${product}${city ? ` (${city})` : ''}`
          : city || message.slice(0, 120) || '';

  return { message, product, company, city, inquirySource, organizationLabel };
}

/**
 * Fills organization / territory / source on {@link LeadRow} when the API row only has marketplace data in `notes`.
 */
export function applyMarketplaceNotesToLeadRow(row: LeadRow, notes: string | null | undefined): LeadRow {
  const notesRaw = String(notes ?? '');
  const ext = extractMarketplaceExternalRef(notes);
  if (
    !ext &&
    !notesRaw.includes('Product:') &&
    !notesRaw.includes('Company:') &&
    !notesRaw.includes('City:')
  ) {
    return row;
  }

  const parsed = parseMarketplaceNotesDisplay(notes);
  const out: LeadRow = { ...row };

  if (ext?.source === 'IndiaMART') {
    out.organization = '';
  } else if (ext?.source === 'TradeIndia') {
    const company = parsed.company || parsed.organizationLabel;
    if (company) out.organization = company;
  } else if (!out.organization?.trim() && parsed.organizationLabel) {
    out.organization = parsed.organizationLabel;
  }

  if (!out.territory?.trim() && parsed.city) {
    out.territory = parsed.city;
  }

  if (ext?.source === 'TradeIndia') {
    const requirement = tradeIndiaRequirementText({
      product: parsed.product,
      message: parsed.message,
    });
    if (requirement) out.requirement = requirement;

    // Fix existing leads where Name was incorrectly set to the mobile number.
    const nameLooksLikePhone =
      looksLikePhoneNumber(out.firstName) || looksLikePhoneNumber(out.name);
    if (nameLooksLikePhone) {
      const displayName = resolveTradeIndiaCustomerName({
        senderName: '',
        companyName: out.organization || parsed.company,
      });
      const parts = splitFullName(displayName);
      out.name = displayName;
      out.firstName = parts.firstName || 'Buyer';
      out.lastName = parts.lastName;
    } else if (/^contact$/i.test((out.lastName ?? '').trim())) {
      // Backend used to default lastName to "Contact" for single-word names.
      out.lastName = '';
      out.name = (out.firstName ?? '').trim() || out.name;
    }
  } else if (!out.requirement?.trim()) {
    if (ext?.source === 'IndiaMART') {
      out.requirement = indiaMartRequirementText({
        customerName: '',
        mobile: '',
        email: '',
        city: parsed.city,
        product: parsed.product,
        quantity: '',
        message: parsed.message,
        source: parsed.inquirySource,
        status: '',
      });
    } else if (parsed.message) {
      out.requirement = plainTextFromHtml(parsed.message);
    }
  }

  if (!out.notes?.trim() && parsed.message) {
    out.notes = plainTextFromHtml(parsed.message);
  }
  if (parsed.inquirySource) {
    out.source = parsed.inquirySource;
  } else if (ext && !out.source?.trim()) {
    out.source = ext.source;
  }

  return out;
}
