import { environment } from '../../../../environments/environment';
import type { LeadRow, LeadSource, LeadStatus } from '../../../features/leads/lead-row.model';
import type { IndiaMartLead } from '../../../features/indiamartlead/indiamart-lead.model';
import type { JustdialLead } from '../../../features/justdiallead/justdial-lead.model';
import type { TradeIndiaLead } from '../../../features/tradeindialead/tradeindia-lead.model';
import type { LeadUpsertDto } from './lead-api.models';

export type MarketplaceApiSource = Extract<LeadSource, 'IndiaMART' | 'Justdial' | 'TradeIndia'>;

interface MarketplaceLeadShape {
  customerName: string;
  mobile: string;
  email: string;
  city: string;
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
export function marketplaceOrganizationName(lead: MarketplaceLeadShape): string {
  const product = lead.product.trim();
  if (product) return product;
  const city = lead.city.trim();
  if (city) return city;
  const customer = lead.customerName.trim();
  if (customer) return customer;
  return 'Marketplace lead';
}

/** Resolves org name from a lead upsert built by {@link toUpsertDto}. */
export function marketplaceOrganizationNameFromUpsert(dto: LeadUpsertDto): string {
  const parsed = parseMarketplaceNotesDisplay(dto.notes);
  if (parsed.product.trim()) return parsed.product.trim();
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
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? 'Lead',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : 'Contact',
  };
}

function buildNotes(source: MarketplaceApiSource, lead: MarketplaceLeadShape): string {
  const lines: string[] = [];
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
  const message = lead.message.trim();
  if (message) return message;
  const product = lead.product.trim();
  if (!product) return '';
  const qty = lead.quantity.trim();
  const qtySuffix = qty && qty !== '—' ? ` · ${qty}` : '';
  return `${product}${qtySuffix}`;
}

function toUpsertDto(source: MarketplaceApiSource, lead: MarketplaceLeadShape): LeadUpsertDto {
  const { firstName, lastName } = splitCustomerName(lead.customerName);
  const status = (lead.status?.trim() || 'New') as LeadStatus;

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
  return toUpsertDto('TradeIndia', lead);
}

/** Parsed from marketplace import notes saved via {@link buildNotes}. */
export interface MarketplaceNotesDisplay {
  message: string;
  product: string;
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
  let city = '';
  let inquirySource = '';

  for (const line of lines) {
    if (line.startsWith('[crm-ext:')) continue;
    const productMatch = line.match(/^Product:\s*(.+)$/i);
    const cityMatch = line.match(/^City:\s*(.+)$/i);
    const inqMatch = line.match(/^Inquiry source:\s*(.+)$/i);
    if (productMatch) product = productMatch[1].trim();
    else if (cityMatch) city = cityMatch[1].trim();
    else if (inqMatch) inquirySource = inqMatch[1].trim();
    else msgLines.push(line);
  }

  const message = msgLines.join('\n').trim();
  const ext = extractMarketplaceExternalRef(notes);
  const organizationLabel =
    ext?.source === 'IndiaMART'
      ? product
        ? `${product}${city ? ` (${city})` : ''}`
        : city
      : product
        ? `${product}${city ? ` (${city})` : ''}`
        : city || message.slice(0, 120) || '';

  return { message, product, city, inquirySource, organizationLabel };
}

/**
 * Fills organization / territory / source on {@link LeadRow} when the API row only has marketplace data in `notes`.
 */
export function applyMarketplaceNotesToLeadRow(row: LeadRow, notes: string | null | undefined): LeadRow {
  const ext = extractMarketplaceExternalRef(notes);
  if (!ext && !String(notes ?? '').includes('Product:') && !String(notes ?? '').includes('City:')) {
    return row;
  }

  const parsed = parseMarketplaceNotesDisplay(notes);
  const out: LeadRow = { ...row };

  if (ext?.source === 'IndiaMART') {
    out.organization = '';
  } else if (!out.organization?.trim() && parsed.organizationLabel) {
    out.organization = parsed.organizationLabel;
  }
  if (!out.territory?.trim() && parsed.city) {
    out.territory = parsed.city;
  }
  if (!out.requirement?.trim()) {
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
      out.requirement = parsed.message;
    }
  }
  if (!out.notes?.trim() && parsed.message) {
    out.notes = parsed.message;
  }
  if (parsed.inquirySource) {
    out.source = parsed.inquirySource;
  } else if (ext && !out.source?.trim()) {
    out.source = ext.source;
  }

  return out;
}
