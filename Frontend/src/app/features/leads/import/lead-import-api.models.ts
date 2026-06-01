/** One row sent to POST /api/leads/import/commit (matches backend LeadImportRowDto). */
export interface LeadImportRowDto {
  rowNumber: number;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  organization?: string;
  industry?: string;
  noOfEmployees?: string;
  annualRevenue?: string;
  website?: string;
  territory?: string;
  status?: string;
  leadOwner?: string;
  requestType?: string;
  requirement?: string;
  additionalDetails?: string;
}

export interface LeadImportCommitResult {
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  validationErrors?: LeadImportRowError[];
}

export interface LeadImportRowError {
  rowNumber: number;
  isDuplicate: boolean;
  errors: string[];
}
