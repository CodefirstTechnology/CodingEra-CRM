import { environment } from '../../../../environments/environment';

/** Whether the Angular client can invoke a marketplace pull for the given backend source code. */
export function isLeadSyncClientPullEnabled(sourceCode: string): boolean {
  const code = sourceCode.trim().toLowerCase();
  const env = environment as {
    enableIndiamartLead?: boolean;
    justdial?: { enabled?: boolean };
    tradeindia?: { enabled?: boolean };
  };

  const flags: Record<string, boolean> = {
    indiamart: !!env.enableIndiamartLead,
    justdial: !!env.justdial?.enabled,
    tradeindia: !!env.tradeindia?.enabled,
  };

  return flags[code] ?? false;
}
