export interface LeadSyncIntervalOption {
  id: number;
  minutes: number;
  label: string;
  sortOrder: number;
}

export interface LeadSyncEligibleUser {
  id: number;
  fullName: string;
  email: string;
  roleName: string;
}

export interface LeadSyncAssignment {
  userId: number;
  fullName: string;
  email: string;
  sortOrder: number;
}

export interface LeadSyncSource {
  id: number;
  code: string;
  displayName: string;
  markerName: string;
  apiIntegrationReady: boolean;
  isConfigured: boolean;
  pullApiUrl: string | null;
  autoSyncEnabled: boolean;
  intervalOptionId: number | null;
  intervalMinutes: number | null;
  intervalLabel: string | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  assignments: LeadSyncAssignment[];
}

export interface LeadSyncMyAccess {
  sourceId: number;
  code: string;
  displayName: string;
  /** Value stored on `leads.lead_source` for this marketplace. */
  markerName: string;
  syncButtonLabel: string;
  apiIntegrationReady: boolean;
  autoSyncEnabled: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
}

export interface LeadSyncManualLog {
  sourceId: number;
  startedAt: string;
  endedAt: string;
  totalReceived: number;
  totalCreated: number;
  failedCount: number;
  errorMessage?: string | null;
}

export interface LeadSyncLogRow {
  id: number;
  sourceId: number;
  sourceName: string;
  syncType: string;
  startedAt: string;
  endedAt: string | null;
  totalReceived: number;
  totalCreated: number;
  failedCount: number;
  triggeredByName: string | null;
  status: string;
  errorMessage: string | null;
}

export interface LeadSyncUpdateAssignments {
  userIds: number[];
}

export interface LeadSyncUpdateAutoSync {
  autoSyncEnabled: boolean;
  intervalOptionId: number | null;
}

export interface LeadSyncCredentialsMasked {
  pullApiUrl: string | null;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  configuredAt: string | null;
}

export interface LeadSyncSaveCredentials {
  pullApiUrl?: string | null;
  apiKey?: string | null;
}

export interface LeadSyncRunResult {
  totalReceived: number;
  totalCreated: number;
  failedCount: number;
  errorMessage: string | null;
  status: string;
}
