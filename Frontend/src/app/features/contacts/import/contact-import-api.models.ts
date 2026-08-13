/** One row sent to POST /api/contacts/import/commit (matches backend ContactImportRowDto). */
export interface ContactImportRowDto {
  rowNumber: number;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  gender?: string;
  organization?: string; // Company Name
  designation?: string;
  address?: string;
}

export interface ContactImportCommitResult {
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  validationErrors?: ContactImportRowError[];
}

export interface ContactImportRowError {
  rowNumber: number;
  isDuplicate: boolean;
  errors: string[];
}
