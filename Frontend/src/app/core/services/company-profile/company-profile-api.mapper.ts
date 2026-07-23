import {
  inboundAddress,
  inboundCompany,
  inboundDescription,
  inboundEmail,
  inboundMobile,
  inboundPerson,
  inboundTitle,
  inboundWebsite,
  TextFormatter,
} from '../../../shared/utils/text-normalizer';
import type { CompanyProfile, CompanyProfileTerm, CompanyProfileUpsert } from './company-profile-api.models';

function readStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string') return v;
  }
  return '';
}

function readNum(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

function unwrapProfileRecord(raw: unknown): Record<string, unknown> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  for (const key of ['data', 'Data', 'result', 'Result']) {
    const inner = o[key];
    if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return o;
}

function readTerms(raw: unknown): CompanyProfileTerm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const title = inboundTitle(readStr(o, ['title', 'Title']));
      const body = inboundDescription(readStr(o, ['body', 'Body', 'content', 'Content']));
      if (!title && !body) return null;
      return { title, body };
    })
    .filter((t): t is CompanyProfileTerm => t != null);
}

function readTermsFromJson(raw: unknown): CompanyProfileTerm[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    return readTerms(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function mapCompanyProfile(raw: unknown): CompanyProfile {
  const o = unwrapProfileRecord(raw);
  const logo = readStr(o, ['logoBase64', 'LogoBase64']);
  const favicon = readStr(o, ['faviconBase64', 'FaviconBase64']);
  return {
    brandName: inboundCompany(readStr(o, ['brandName', 'BrandName'])),
    companyName: inboundCompany(readStr(o, ['companyName', 'CompanyName'])),
    tagline: inboundTitle(readStr(o, ['tagline', 'Tagline'])),
    businessLine: inboundTitle(readStr(o, ['businessLine', 'BusinessLine'])),
    logoContentType: readStr(o, ['logoContentType', 'LogoContentType']),
    logoBase64: logo.trim() ? logo : null,
    faviconContentType: readStr(o, ['faviconContentType', 'FaviconContentType']),
    faviconBase64: favicon.trim() ? favicon : null,
    gstin: TextFormatter.gstin(readStr(o, ['gstin', 'Gstin'])),
    cinNumber: readStr(o, ['cinNumber', 'CinNumber']).trim().toUpperCase(),
    address: inboundAddress(readStr(o, ['address', 'Address'])),
    contactNumber: inboundMobile(readStr(o, ['contactNumber', 'ContactNumber'])),
    email: inboundEmail(readStr(o, ['email', 'Email'])),
    website: inboundWebsite(readStr(o, ['website', 'Website'])),
    bankName: inboundCompany(readStr(o, ['bankName', 'BankName'])),
    accountNumber: readStr(o, ['accountNumber', 'AccountNumber']).trim(),
    ifscCode: readStr(o, ['ifscCode', 'IfscCode']).trim().toUpperCase(),
    branchName: inboundTitle(readStr(o, ['branchName', 'BranchName'])),
    signatoryName: inboundPerson(readStr(o, ['signatoryName', 'SignatoryName'])),
    signatoryMobile: inboundMobile(readStr(o, ['signatoryMobile', 'SignatoryMobile'])),
    terms: (() => {
      const fromArray = readTerms(o['terms'] ?? o['Terms']);
      if (fromArray.length) return fromArray;
      return readTermsFromJson(o['termsConditionsJson'] ?? o['TermsConditionsJson']);
    })(),
    introText: inboundDescription(readStr(o, ['introText', 'IntroText'])),
    transportationLabel: inboundTitle(readStr(o, ['transportationLabel', 'TransportationLabel'])),
    jurisdiction: inboundTitle(readStr(o, ['jurisdiction', 'Jurisdiction'])),
    defaultGstPercent: readNum(o, ['defaultGstPercent', 'DefaultGstPercent']) || 18,
    updatedAt: readStr(o, ['updatedAt', 'UpdatedAt']) || null,
  };
}

export function toCompanyProfileUpsertBody(profile: CompanyProfileUpsert): Record<string, unknown> {
  return {
    brandName: profile.brandName,
    companyName: profile.companyName,
    tagline: profile.tagline,
    businessLine: profile.businessLine,
    logoContentType: profile.logoContentType,
    logoBase64: profile.logoBase64,
    removeLogo: profile.removeLogo,
    faviconContentType: profile.faviconContentType,
    faviconBase64: profile.faviconBase64,
    removeFavicon: profile.removeFavicon,
    gstin: profile.gstin,
    cinNumber: profile.cinNumber,
    address: profile.address,
    contactNumber: profile.contactNumber,
    email: profile.email,
    website: profile.website,
    bankName: profile.bankName,
    accountNumber: profile.accountNumber,
    ifscCode: profile.ifscCode,
    branchName: profile.branchName,
    signatoryName: profile.signatoryName,
    signatoryMobile: profile.signatoryMobile,
    terms: profile.terms.map((t) => ({ title: t.title, body: t.body })),
    introText: profile.introText,
    transportationLabel: profile.transportationLabel,
    jurisdiction: profile.jurisdiction,
    defaultGstPercent: profile.defaultGstPercent,
  };
}
