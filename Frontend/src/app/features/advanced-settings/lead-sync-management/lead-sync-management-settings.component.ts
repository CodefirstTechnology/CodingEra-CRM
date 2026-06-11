import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isAdmin } from '../../../core/auth/auth-role.util';
import { AuthService } from '../../../core/auth/auth.service';
import type {
  LeadSyncEligibleUser,
  LeadSyncIntervalOption,
  LeadSyncLogRow,
  LeadSyncSource,
} from '../../../core/services/lead-sync/lead-sync-api.models';
import { LeadSyncHttpService } from '../../../core/services/lead-sync/lead-sync-http.service';
import { ToastService } from '../../../core/toast/toast.service';

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
  protected readonly loadError = signal<string | null>(null);
  protected readonly activeTab = signal<'config' | 'history'>('config');

  protected readonly sources = signal<LeadSyncSource[]>([]);
  protected readonly eligibleUsers = signal<LeadSyncEligibleUser[]>([]);
  protected readonly intervals = signal<LeadSyncIntervalOption[]>([]);
  protected readonly history = signal<LeadSyncLogRow[]>([]);

  /** Per-source draft user selections before save. */
  protected readonly draftUserIds = signal<Record<number, number[]>>({});
  protected readonly draftAutoSync = signal<
    Record<number, { enabled: boolean; intervalOptionId: number | null }>
  >({});

  ngOnInit(): void {
    if (!this.isAdmin()) {
      this.loadError.set('Only administrators can manage lead sync settings.');
      return;
    }
    this.loadAll();
  }

  protected setTab(tab: 'config' | 'history'): void {
    this.activeTab.set(tab);
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  protected loadAll(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.listSources().subscribe({
      next: (rows) => {
        this.sources.set(rows);
        this.initDrafts(rows);
        this.loading.set(false);
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

    this.api.listIntervals().subscribe({
      next: (rows) => this.intervals.set(rows),
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

  protected saveAssignments(source: LeadSyncSource): void {
    const userIds = this.draftUserIds()[source.id] ?? [];
    this.savingSourceId.set(source.id);
    this.api.updateAssignments(source.id, { userIds }).subscribe({
      next: (rows) => {
        this.sources.set(rows);
        this.initDrafts(rows);
        this.savingSourceId.set(null);
        this.toast.success(`${source.displayName} assignments saved.`);
      },
      error: () => {
        this.savingSourceId.set(null);
        this.toast.error('Failed to save assignments.');
      },
    });
  }

  protected autoSyncEnabled(sourceId: number): boolean {
    return this.draftAutoSync()[sourceId]?.enabled ?? false;
  }

  protected autoSyncInterval(sourceId: number): number | null {
    return this.draftAutoSync()[sourceId]?.intervalOptionId ?? null;
  }

  protected setAutoSyncEnabled(sourceId: number, enabled: boolean): void {
    this.draftAutoSync.update((m) => ({
      ...m,
      [sourceId]: {
        enabled,
        intervalOptionId: m[sourceId]?.intervalOptionId ?? this.defaultIntervalId(),
      },
    }));
  }

  protected setAutoSyncInterval(sourceId: number, optionId: number): void {
    this.draftAutoSync.update((m) => ({
      ...m,
      [sourceId]: {
        enabled: m[sourceId]?.enabled ?? false,
        intervalOptionId: optionId > 0 ? optionId : null,
      },
    }));
  }

  protected saveAutoSync(source: LeadSyncSource): void {
    const draft = this.draftAutoSync()[source.id];
    if (!draft) return;

    if (draft.enabled && !(draft.intervalOptionId != null && draft.intervalOptionId > 0)) {
      this.toast.error('Select a sync interval when auto sync is enabled.');
      return;
    }

    this.savingSourceId.set(source.id);
    this.api
      .updateAutoSync(source.id, {
        autoSyncEnabled: draft.enabled,
        intervalOptionId: draft.intervalOptionId,
      })
      .subscribe({
        next: (rows) => {
          this.sources.set(rows);
          this.initDrafts(rows);
          this.savingSourceId.set(null);
          this.toast.success(`${source.displayName} auto sync settings saved.`);
        },
        error: () => {
          this.savingSourceId.set(null);
          this.toast.error('Failed to save auto sync settings.');
        },
      });
  }

  private initDrafts(sources: LeadSyncSource[]): void {
    const userDraft: Record<number, number[]> = {};
    const autoDraft: Record<number, { enabled: boolean; intervalOptionId: number | null }> = {};
    for (const s of sources) {
      userDraft[s.id] = s.assignments.map((a) => a.userId);
      autoDraft[s.id] = {
        enabled: s.autoSyncEnabled,
        intervalOptionId: s.intervalOptionId ?? this.defaultIntervalId(),
      };
    }
    this.draftUserIds.set(userDraft);
    this.draftAutoSync.set(autoDraft);
  }

  private defaultIntervalId(): number | null {
    const rows = this.intervals();
    return rows.length > 0 ? rows[0].id : null;
  }
}
