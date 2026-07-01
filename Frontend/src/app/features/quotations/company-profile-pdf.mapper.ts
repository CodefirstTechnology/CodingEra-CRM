import type { CompanyProfile } from '../../core/services/company-profile/company-profile-api.models';
import type { QuotationUpsertDto } from '../../core/services/quotations/quotation-api.models';
import { QUOTATION_PDF_COMPANY } from './quotation-pdf.config';

export type QuotationPdfCompanyConfig = typeof QUOTATION_PDF_COMPANY & {
  logoContentType?: string;
  logoBase64?: string | null;
  logoPixelWidth?: number;
  logoPixelHeight?: number;
  signatoryName?: string;
  signatoryMobile?: string;
};

function pickStr(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function parseEmails(value: string): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function mapTerms(profileTerms: CompanyProfile['terms']): typeof QUOTATION_PDF_COMPANY.terms {
  if (!profileTerms?.length) return [];
  return profileTerms
    .map((t) => ({
      title: t.title?.trim() ?? '',
      body: t.body?.trim() ?? '',
    }))
    .filter((t) => t.title || t.body);
}

/** Map company profile from API; styling comes from PDF config, content from profile only. */
export function mergeCompanyProfileForPdf(profile: CompanyProfile | null | undefined): QuotationPdfCompanyConfig {
  const style = QUOTATION_PDF_COMPANY;
  const p = profile ?? ({} as CompanyProfile);

  const companyName = pickStr(p.companyName);
  const brandName = pickStr(p.brandName);

  return {
    ...style,
    brandName,
    brandTagline: pickStr(p.tagline),
    legalName: companyName,
    businessLine: pickStr(p.businessLine),
    gstin: pickStr(p.gstin),
    cin: pickStr(p.cinNumber),
    signatureEntity: companyName ? companyName.toUpperCase() : '',
    address: pickStr(p.address),
    contactPhone: pickStr(p.contactNumber),
    emails: parseEmails(p.email ?? ''),
    website: pickStr(p.website),
    jurisdiction: pickStr(p.jurisdiction),
    introText: pickStr(p.introText),
    transportationLabel: pickStr(p.transportationLabel),
    defaultGstPercent: p.defaultGstPercent > 0 ? p.defaultGstPercent : style.defaultGstPercent,
    terms: mapTerms(p.terms),
    logoContentType: p.logoContentType?.trim() || undefined,
    logoBase64: p.logoBase64,
    signatoryName: p.signatoryName?.trim() || undefined,
    signatoryMobile: p.signatoryMobile?.trim() || undefined,
    bankName: pickStr(p.bankName),
    accountNumber: pickStr(p.accountNumber),
    ifscCode: pickStr(p.ifscCode),
    branchName: pickStr(p.branchName),
  };
}

/** Apply quotation-specific terms when customized; otherwise keep company profile defaults. */
export function resolveQuotationPdfContent(
  quotation: QuotationUpsertDto,
  company: QuotationPdfCompanyConfig,
): QuotationPdfCompanyConfig {
  if (!quotation.customizeTerms) return company;

  const terms = (quotation.terms ?? [])
    .map((t) => ({
      title: t.title?.trim() ?? '',
      body: t.body?.trim() ?? '',
    }))
    .filter((t) => t.title || t.body);

  return {
    ...company,
    businessLine: quotation.introText?.trim() ?? company.businessLine,
    transportationLabel: quotation.transportationLabel?.trim() ?? '',
    jurisdiction: quotation.jurisdiction?.trim() ?? '',
    terms,
  };
}
