import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import {
  FollowUpAdminEscalationDto,
  FollowUpPopupEventDto,
  UserStatusSignalRService,
} from '../../core/services/user-status-signalr.service';

@Component({
  selector: 'app-overdue-followups',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './overdue-followups.component.html',
  styleUrl: './overdue-followups.component.scss',
})
export class OverdueFollowupsComponent implements OnInit {
  private readonly signalR = inject(UserStatusSignalRService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly isAdmin = computed(() => this.permissions.canViewAllRecords());
  protected readonly escalations = this.signalR.adminEscalations;
  protected readonly userOverdue = this.signalR.userOverdueList;

  protected readonly searchQuery = signal('');
  protected readonly loading = signal(false);

  // Reschedule Modal State
  protected readonly rescheduleTaskId = signal<number | null>(null);
  protected readonly rescheduleReason = signal('');
  protected readonly rescheduleNewDate = signal('');
  protected readonly rescheduleError = signal<string | null>(null);

  protected readonly filteredEscalations = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.escalations();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.customerName.toLowerCase().includes(q) ||
        item.leadFormattedId.toLowerCase().includes(q) ||
        item.salesExecutiveName.toLowerCase().includes(q) ||
        item.taskTitle.toLowerCase().includes(q)
    );
  });

  protected readonly filteredUserOverdue = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.userOverdue();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.customerName.toLowerCase().includes(q) ||
        item.leadFormattedId.toLowerCase().includes(q) ||
        (item.contactPerson && item.contactPerson.toLowerCase().includes(q)) ||
        item.taskTitle.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.hydrateOverdueFollowUps();
  }

  private hydrateOverdueFollowUps(): void {
    this.loading.set(true);
    const apiBase = (environment.apiUrl || '/api').replace(/\/$/, '');
    const user = this.auth.user();

    if (this.isAdmin()) {
      const url = `${apiBase}/followup/admin/escalations`;
      this.http.get<FollowUpAdminEscalationDto[]>(url).subscribe({
        next: (list) => {
          this.loading.set(false);
          if (Array.isArray(list)) {
            this.signalR.adminEscalations.set(list);
          }
        },
        error: () => this.loading.set(false),
      });
    } else if (user?.id) {
      const url = `${apiBase}/followup/user/${user.id}/overdue`;
      this.http.get<FollowUpPopupEventDto[]>(url).subscribe({
        next: (list) => {
          this.loading.set(false);
          if (Array.isArray(list)) {
            this.signalR.userOverdueList.set(list);
          }
        },
        error: () => this.loading.set(false),
      });
    } else {
      this.loading.set(false);
    }
  }

  protected viewLead(leadId: number): void {
    void this.router.navigate(['/leads', leadId]);
  }

  protected reassignLead(leadId: number): void {
    void this.router.navigate(['/leads', leadId], { queryParams: { action: 'reassign' } });
  }

  protected completeFollowUp(taskId: number): void {
    const apiBase = (environment.apiUrl || '/api').replace(/\/$/, '');
    this.http
      .post(`${apiBase}/followup/tasks/${taskId}/complete-followup`, {
        notes: 'Follow-up marked completed from Overdue Page',
        isCallLogged: true,
        callDurationSeconds: 60,
      })
      .subscribe({
        next: () => this.hydrateOverdueFollowUps(),
      });
  }

  protected openRescheduleModal(taskId: number): void {
    const defaultDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
    this.rescheduleTaskId.set(taskId);
    this.rescheduleReason.set('');
    this.rescheduleNewDate.set(defaultDate);
    this.rescheduleError.set(null);
  }

  protected closeRescheduleModal(): void {
    this.rescheduleTaskId.set(null);
  }

  protected submitReschedule(): void {
    const taskId = this.rescheduleTaskId();
    const reason = this.rescheduleReason().trim();
    const newDateStr = this.rescheduleNewDate();

    if (!taskId) return;

    if (!reason) {
      this.rescheduleError.set('A valid reschedule reason is mandatory.');
      return;
    }

    if (!newDateStr) {
      this.rescheduleError.set('Please select a valid new due date in the future.');
      return;
    }

    const newDueDate = new Date(newDateStr);
    if (isNaN(newDueDate.getTime()) || newDueDate <= new Date()) {
      this.rescheduleError.set('New due date must be in the future.');
      return;
    }

    const apiBase = (environment.apiUrl || '/api').replace(/\/$/, '');
    this.http
      .post(`${apiBase}/followup/tasks/${taskId}/reschedule-followup`, {
        rescheduleReason: reason,
        newDueDate: newDueDate.toISOString(),
      })
      .subscribe({
        next: () => {
          this.closeRescheduleModal();
          this.hydrateOverdueFollowUps();
        },
        error: (err) => {
          this.rescheduleError.set(err?.error || 'Failed to reschedule task.');
        },
      });
  }
}
