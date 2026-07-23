import {
  inboundEmail,
  inboundMaster,
  inboundPerson,
  inboundTitle,
} from '../../../shared/utils/text-normalizer';
import type {
  LeadSyncEligibleUser,
  LeadSyncIntervalOption,
  LeadSyncLogRow,
  LeadSyncMyAccess,
  LeadSyncSource,
} from './lead-sync-api.models';

function str(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1;
}

function nullableStr(v: unknown): string | null {
  const s = str(v).trim();
  return s.length ? s : null;
}

export function mapLeadSyncIntervalOption(row: unknown): LeadSyncIntervalOption {
  const o = (row ?? {}) as Record<string, unknown>;
  return {
    id: num(o['id']),
    minutes: num(o['minutes'] ?? o['hours']),
    label: inboundTitle(str(o['label'])),
    sortOrder: num(o['sortOrder']),
  };
}

export function mapLeadSyncEligibleUser(row: unknown): LeadSyncEligibleUser {
  const o = (row ?? {}) as Record<string, unknown>;
  return {
    id: num(o['id']),
    fullName: inboundPerson(str(o['fullName'])),
    email: inboundEmail(str(o['email'])),
    roleName: inboundMaster('role', str(o['roleName'])),
  };
}

export function mapLeadSyncSource(row: unknown): LeadSyncSource {
  const o = (row ?? {}) as Record<string, unknown>;
  const assignmentsRaw = o['assignments'];
  const assignments = Array.isArray(assignmentsRaw)
    ? assignmentsRaw.map((a) => {
        const x = (a ?? {}) as Record<string, unknown>;
        return {
          userId: num(x['userId']),
          fullName: inboundPerson(str(x['fullName'])),
          email: inboundEmail(str(x['email'])),
          sortOrder: num(x['sortOrder']),
        };
      })
    : [];

  return {
    id: num(o['id']),
    code: str(o['code']),
    displayName: inboundTitle(str(o['displayName'])),
    markerName: inboundTitle(str(o['markerName'])),
    apiIntegrationReady: bool(o['apiIntegrationReady']),
    isConfigured: bool(o['isConfigured']),
    pullApiUrl: nullableStr(o['pullApiUrl']),
    autoSyncEnabled: bool(o['autoSyncEnabled']),
    intervalOptionId: o['intervalOptionId'] == null ? null : num(o['intervalOptionId']),
    intervalMinutes:
      o['intervalMinutes'] == null && o['intervalHours'] == null
        ? null
        : num(o['intervalMinutes'] ?? (Number(o['intervalHours']) || 0) * 60),
    intervalLabel: o['intervalLabel'] == null ? null : inboundTitle(str(o['intervalLabel'])),
    lastSyncAt: nullableStr(o['lastSyncAt']),
    nextSyncAt: nullableStr(o['nextSyncAt']),
    assignments,
  };
}

export function mapLeadSyncMyAccess(row: unknown): LeadSyncMyAccess {
  const o = (row ?? {}) as Record<string, unknown>;
  return {
    sourceId: num(o['sourceId']),
    code: str(o['code']),
    displayName: inboundTitle(str(o['displayName'])),
    syncButtonLabel: inboundTitle(str(o['syncButtonLabel'])),
    apiIntegrationReady: bool(o['apiIntegrationReady']),
    autoSyncEnabled: bool(o['autoSyncEnabled']),
    lastSyncAt: nullableStr(o['lastSyncAt']),
    nextSyncAt: nullableStr(o['nextSyncAt']),
  };
}

export function mapLeadSyncLogRow(row: unknown): LeadSyncLogRow {
  const o = (row ?? {}) as Record<string, unknown>;
  const triggered = nullableStr(o['triggeredByName']);
  return {
    id: num(o['id']),
    sourceId: num(o['sourceId']),
    sourceName: inboundTitle(str(o['sourceName'])),
    syncType: str(o['syncType']),
    startedAt: str(o['startedAt']),
    endedAt: nullableStr(o['endedAt']),
    totalReceived: num(o['totalReceived']),
    totalCreated: num(o['totalCreated']),
    failedCount: num(o['failedCount']),
    triggeredByName: triggered ? inboundPerson(triggered) : null,
    status: inboundMaster('status', str(o['status'])),
    errorMessage: nullableStr(o['errorMessage']),
  };
}

export function mapLeadSyncSources(rows: unknown): LeadSyncSource[] {
  return Array.isArray(rows) ? rows.map(mapLeadSyncSource) : [];
}

export function mapLeadSyncMyAccessList(rows: unknown): LeadSyncMyAccess[] {
  return Array.isArray(rows) ? rows.map(mapLeadSyncMyAccess) : [];
}

export function mapLeadSyncLogRows(rows: unknown): LeadSyncLogRow[] {
  return Array.isArray(rows) ? rows.map(mapLeadSyncLogRow) : [];
}
