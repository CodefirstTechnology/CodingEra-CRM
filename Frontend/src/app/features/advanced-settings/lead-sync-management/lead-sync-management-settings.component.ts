import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isAdmin } from '../../../core/auth/auth-role.util';
import { AuthService } from '../../../core/auth/auth.service';
import type {
  LeadSyncEligibleUser,
  LeadSyncLogRow,
  LeadSyncSource,
} from '../../../core/services/lead-sync/lead-sync-api.models';
import { LeadSyncHttpService } from '../../../core/services/lead-sync/lead-sync-http.service';
import {
  getLeadSyncProviderUi,
  type LeadSyncCredentialFieldDef,
} from '../../../core/services/lead-sync/lead-sync-provider-fields.registry';
import { ToastService } from '../../../core/toast/toast.service';

type LeadSyncMainTab = 'config' | 'history';
type LeadSyncSourcePanel = 'connection' | 'team' | 'automation';

@Component({
  selector: 'app-lead-sync-management-settings',
  imports: [FormsModule, DatePipe],
  templateUrl: './lead-sync-management-settings.component.html',
  styleUrl: './lead-sync-management-settings.component.scss',
})
export class LeadSyncManagementSettingsComponent implements OnInit {
  private readonly api = inject(LeadSyncHttpService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly isAdmin = computed(() => isAdmin(this.auth.user()));

  protected readonly loading = signal(false);
  protected readonly savingSourceId = signal<number | null>(null);
  protected readonly testingSourceId = signal<number | null>(null);
  protected readonly syncingSourceId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly activeTab = signal<LeadSyncMainTab>('config');
  protected readonly selectedSourceId = signal<number | null>(null);
  protected readonly sourcePanel = signal<LeadSyncSourcePanel>('connection');
  protected readonly teamSearchQuery = signal('');

  protected readonly sources = signal<LeadSyncSource[]>([]);
  protected readonly eligibleUsers = signal<LeadSyncEligibleUser[]>([]);
  protected readonly history = signal<LeadSyncLogRow[]>([]);

  protected readonly draftUserIds = signal<Record<number, number[]>>({});
  protected readonly draftAutoSync = signal<Record<number, boolean>>({});
  protected readonly draftPullUrl = signal<Record<number, string>>({});
  protected readonly draftApiKey = signal<Record<number, string>>({});
  protected readonly maskedKey = signal<Record<number, string | null>>({});

  protected readonly selectedSource = computed(() => {
    const id = this.selectedSourceId();
    return this.sources().find((s) => s.id === id) ?? null;
  });

  protected readonly filteredTeamUsers = computed(() => {
    const q = this.teamSearchQuery().trim().toLowerCase();
    const users = this.eligibleUsers();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleName.toLowerCase().includes(q),
    );
  });

  protected readonly selectedTeamCount = computed(() => {
    const source = this.selectedSource();
    if (!source) return 0;
    return (this.draftUserIds()[source.id] ?? []).length;
  });

  ngOnInit(): void {
    if (!this.isAdmin()) {
      this.loadError.set('Only administrators can manage lead sync settings.');
      return;
    }
    this.loadAll();
  }

  protected providerUi(code: string) {
    return getLeadSyncProviderUi(code);
  }

  protected setTab(tab: LeadSyncMainTab): void {
    this.activeTab.set(tab);
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  protected selectSource(source: LeadSyncSource): void {
    this.selectedSourceId.set(source.id);
    this.sourcePanel.set('connection');
    this.teamSearchQuery.set('');
  }

  protected setSourcePanel(panel: LeadSyncSourcePanel): void {
    this.sourcePanel.set(panel);
  }

  protected onTeamSearch(event: Event): void {
    this.teamSearchQuery.set((event.target as HTMLInputElement).value);
  }

  protected loadAll(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.listSources().subscribe({
      next: (rows) => {
        this.sources.set(rows);
        this.initDrafts(rows);
        this.ensureSelectedSource(rows);
        this.loading.set(false);
        for (const source of rows) {
          this.loadCredentialsDraft(source);
        }
      },
      error: () => {
        this.loadError.set('Failed to load lead sync sources.');
        this.loading.set(false);
      },
    });

    this.api.listEligibleUsers().subscribe({
      next: (rows) => this.eligibleUsers.set(rows),
      error: () => {},
    });
  }

  protected loadHistory(): void {
    this.api.listHistory(undefined, 100).subscribe({
      next: (rows) => this.history.set(rows),
      error: () => this.toast.error('Failed to load sync history.'),
    });
  }

  protected isUserSelected(sourceId: number, userId: number): boolean {
    return (this.draftUserIds()[sourceId] ?? []).includes(userId);
  }

  protected toggleUser(sourceId: number, userId: number, checked: boolean): void {
    const current = [...(this.draftUserIds()[sourceId] ?? [])];
    if (checked) {
      if (!current.includes(userId)) current.push(userId);
    } else {
      const idx = current.indexOf(userId);
      if (idx >= 0) current.splice(idx, 1);
    }
    this.draftUserIds.update((m) => ({ ...m, [sourceId]: current }));
  }

  protected selectAllFilteredUsers(sourceId: number): void {
    const ids = this.filteredTeamUsers().map((u) => u.id);
    const merged = new Set([...(this.draftUserIds()[sourceId] ?? []), ...ids]);
    this.draftUserIds.update((m) => ({ ...m, [sourceId]: [...merged] }));
  }

  protected clearAllTeamUsers(sourceId: number): void {
    this.draftUserIds.update((m) => ({ ...m, [sourceId]: [] }));
  }

  protected saveAssignments(source: LeadSyncSource): void {
    const userIds = this.draftUserIds()[source.id] ?? [];
    this.savingSourceId.set(source.id);
    this.api.updateAssignments(source.id, { userIds }).subscribe({
      next: (rows) => {
        this.sources.set(rows);
        this.initDrafts(rows);
        this.savingSourceId.set(null);
        this.toast.success(`${source.displayName} team access saved.`);
      },
      error: () => {
        this.savingSourceId.set(null);
        this.toast.error('Failed to save team access.');
      },
    });
  }

  protected autoSyncEnabled(sourceId: number): boolean {
    return this.draftAutoSync()[sourceId] ?? false;
  }

  protected setAutoSyncEnabled(sourceId: number, enabled: boolean): void {
    this.draftAutoSync.update((m) => ({ ...m, [sourceId]: enabled }));
  }

  protected pullUrlDraft(source: LeadSyncSource): string {
    return this.draftPullUrl()[source.id] ?? '';
  }

  protected setPullUrlDraft(sourceId: number, value: string): void {
    this.draftPullUrl.update((m) => ({ ...m, [sourceId]: value }));
  }

  protected apiKeyDraft(sourceId: number): string {
    return this.draftApiKey()[sourceId] ?? '';
  }

  protected setApiKeyDraft(sourceId: number, value: string): void {
    this.draftApiKey.update((m) => ({ ...m, [sourceId]: value }));
  }

  protected maskedApiKey(sourceId: number): string | null {
    return this.maskedKey()[sourceId] ?? null;
  }

  protected saveCredentials(source: LeadSyncSource): void {
    const ui = getLeadSyncProviderUi(source.code);
    if (!ui) return;

    const pullApiUrl = (this.draftPullUrl()[source.id] ?? '').trim();
    const apiKey = (this.draftApiKey()[source.id] ?? '').trim();
    const hasExistingKey = source.isConfigured || !!this.maskedApiKey(source.id);

    if (!pullApiUrl) {
      this.toast.error('Lead pull API URL is required.');
      return;
    }
    if (!apiKey && !hasExistingKey) {
      this.toast.error('API key is required.');
      return;
    }

    this.savingSourceId.set(source.id);
    this.api
      .saveCredentials(source.id, {
        pullApiUrl,
        apiKey: apiKey || null,
      })
      .subscribe({
        next: (rows) => {
          this.sources.set(rows);
          this.initDrafts(rows);
          this.draftApiKey.update((m) => ({ ...m, [source.id]: '' }));
          this.loadCredentialsDraft(source);
          this.savingSourceId.set(null);
          this.toast.success(`${source.displayName} API connection saved.`);
        },
        error: () => {
          this.savingSourceId.set(null);
          this.toast.error('Failed to save API connection.');
        },
      });
  }

  protected testConnection(source: LeadSyncSource): void {
    this.testingSourceId.set(source.id);
    this.api.testConnection(source.id).subscribe({
      next: (result) => {
        this.testingSourceId.set(null);
        if (result.errorMessage || result.status === 'Failed') {
          this.toast.error(result.errorMessage ?? 'Connection test failed.');
          return;
        }
        this.toast.success(
          `Connection OK — ${result.totalReceived} lead(s) found in the API response.`,
        );
      },
      error: () => {
        this.testingSourceId.set(null);
        this.toast.error('Connection test failed.');
      },
    });
  }

  protected syncNow(source: LeadSyncSource): void {
    this.syncingSourceId.set(source.id);
    this.api.runSync(source.id).subscribe({
      next: (result) => {
        this.syncingSourceId.set(null);
        this.loadHistory();
        this.loadAll();
        if (result.errorMessage || result.status === 'Failed') {
          this.toast.error(result.errorMessage ?? 'Sync failed.');
          return;
        }
        this.toast.success(
          `${source.displayName}: ${result.totalCreated} new lead(s) imported (${result.totalReceived} received).`,
        );
      },
      error: (err: unknown) => {
        this.syncingSourceId.set(null);
        const msg = err instanceof Error ? err.message : 'Sync failed.';
        this.toast.error(msg);
      },
    });
  }

  protected saveAutoSync(source: LeadSyncSource): void {
    const enabled = this.draftAutoSync()[source.id];
    if (enabled == null) return;

    this.savingSourceId.set(source.id);
    this.api
      .updateAutoSync(source.id, {
        autoSyncEnabled: enabled,
        intervalOptionId: null,
      })
      .subscribe({
        next: (rows) => {
          this.sources.set(rows);
          this.initDrafts(rows);
          this.savingSourceId.set(null);
          this.toast.success(
            enabled
              ? `${source.displayName} automatic sync enabled.`
              : `${source.displayName} automatic sync disabled.`,
          );
        },
        error: () => {
          this.savingSourceId.set(null);
          this.toast.error('Failed to save automatic sync settings.');
        },
      });
  }

  protected fieldInputType(field: LeadSyncCredentialFieldDef): string {
    return field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text';
  }

  protected statusLabel(source: LeadSyncSource): string {
    return source.isConfigured ? 'Connected' : 'Not connected';
  }

  protected statusClass(source: LeadSyncSource): string {
    return source.isConfigured ? 'lsync__badge--ready' : 'lsync__badge--pending';
  }

  protected userInitial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  private ensureSelectedSource(sources: LeadSyncSource[]): void {
    const current = this.selectedSourceId();
    if (current != null && sources.some((s) => s.id === current)) return;
    const first = sources.find((s) => getLeadSyncProviderUi(s.code));
    this.selectedSourceId.set(first?.id ?? null);
  }

  private initDrafts(sources: LeadSyncSource[]): void {
    const userDraft: Record<number, number[]> = {};
    const autoDraft: Record<number, boolean> = {};
    const urlDraft: Record<number, string> = {};
    for (const s of sources) {
      userDraft[s.id] = s.assignments.map((a) => a.userId);
      autoDraft[s.id] = s.autoSyncEnabled;
      const ui = getLeadSyncProviderUi(s.code);
      const defaultUrl = ui?.fields.find((f) => f.key === 'pullApiUrl')?.defaultValue ?? '';
      urlDraft[s.id] = s.pullApiUrl ?? defaultUrl;
    }
    this.draftUserIds.set(userDraft);
    this.draftAutoSync.set(autoDraft);
    this.draftPullUrl.set(urlDraft);
  }

  private loadCredentialsDraft(source: LeadSyncSource): void {
    this.api.getCredentials(source.id).subscribe({
      next: (creds) => {
        if (creds.pullApiUrl) {
          this.draftPullUrl.update((m) => ({ ...m, [source.id]: creds.pullApiUrl! }));
        }
        this.maskedKey.update((m) => ({ ...m, [source.id]: creds.apiKeyMasked }));
      },
      error: () => {},
    });
  }
}
