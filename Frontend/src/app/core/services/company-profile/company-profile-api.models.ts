export interface CompanyProfileTerm {
  title: string;
  body: string;
}

export interface CompanyProfile {
  brandName: string;
  companyName: string;
  tagline: string;
  businessLine: string;
  logoContentType: string;
  logoBase64: string | null;
  gstin: string;
  cinNumber: string;
  address: string;
  contactNumber: string;
  email: string;
  website: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  signatoryName: string;
  signatoryMobile: string;
  terms: CompanyProfileTerm[];
  introText: string;
  transportationLabel: string;
  jurisdiction: string;
  defaultGstPercent: number;
  updatedAt: string | null;
}

export interface CompanyProfileUpsert {
  brandName: string;
  companyName: string;
  tagline: string;
  businessLine: string;
  logoContentType: string;
  logoBase64: string | null;
  removeLogo: boolean;
  gstin: string;
  cinNumber: string;
  address: string;
  contactNumber: string;
  email: string;
  website: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  signatoryName: string;
  signatoryMobile: string;
  terms: CompanyProfileTerm[];
  introText: string;
  transportationLabel: string;
  jurisdiction: string;
  defaultGstPercent: number;
}
