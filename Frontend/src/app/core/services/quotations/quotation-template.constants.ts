export const QuotationTemplateType = {
  Standard: 'Standard',
  TechnicalProposal: 'TechnicalProposal',
} as const;

export type QuotationTemplateType =
  (typeof QuotationTemplateType)[keyof typeof QuotationTemplateType];

export const QUOTATION_TEMPLATE_OPTIONS: { value: QuotationTemplateType; label: string }[] = [
  { value: QuotationTemplateType.Standard, label: 'Standard Quotation' },
  { value: QuotationTemplateType.TechnicalProposal, label: 'Technical Proposal' },
];

export const DEFAULT_QUOTATION_CURRENCY = 'INR';

export const QUOTATION_CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;

export type QuotationCurrencyCode = (typeof QUOTATION_CURRENCY_OPTIONS)[number];

export function normalizeQuotationTemplateType(value: string | null | undefined): QuotationTemplateType {
  const v = (value ?? '').trim();
  if (v === QuotationTemplateType.TechnicalProposal) return QuotationTemplateType.TechnicalProposal;
  return QuotationTemplateType.Standard;
}

export function isTechnicalProposalTemplate(
  value: QuotationTemplateType | string | null | undefined,
): boolean {
  return normalizeQuotationTemplateType(value ?? '') === QuotationTemplateType.TechnicalProposal;
}

export function parseQuotationTemplateFromQuery(value: string | null | undefined): QuotationTemplateType {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'technical-proposal' || v === 'technicalproposal') {
    return QuotationTemplateType.TechnicalProposal;
  }
  return QuotationTemplateType.Standard;
}

export function quotationTemplateQueryParam(template: QuotationTemplateType): string | undefined {
  if (template === QuotationTemplateType.TechnicalProposal) return 'technical-proposal';
  return undefined;
}

export function quotationTemplateLabel(template: QuotationTemplateType | string | null | undefined): string {
  return isTechnicalProposalTemplate(template) ? 'Technical Proposal' : 'Standard Quotation';
}
