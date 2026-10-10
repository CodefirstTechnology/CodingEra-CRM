import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import {
  FollowUpAdminEscalationDto,
  FollowUpPopupEventDto,
  UserStatusSignalRService,
} from '../../core/services/user-status-signalr.service';

@Component({
  selector: 'app-admin-sla-breach',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-sla-breach.component.html',
  styleUrl: './admin-sla-breach.component.scss',
})
export class AdminSlaBreachComponent implements OnInit {
  private readonly signalR = inject(UserStatusSignalRService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly isAdmin = computed(() => this.permissions.canViewAllRecords());
  protected readonly escalations = this.signalR.adminEscalations;
  protected readonly userOverdue = this.signalR.userOverdueList;

  // Show maximum 4 cards on dashboard
  protected readonly displayedEscalations = computed(() => this.escalations().slice(0, 4));
  protected readonly displayedUserOverdue = computed(() => this.userOverdue().slice(0, 4));
  protected readonly totalEscalationsCount = computed(() => this.escalations().length);
  protected readonly totalUserOverdueCount = computed(() => this.userOverdue().length);

  ngOnInit(): void {
    this.hydrateOverdueFollowUps();
  }

  private hydrateOverdueFollowUps(): void {
    const apiBase = (environment.apiUrl || '/api').replace(/\/$/, '');
    const user = this.auth.user();

    if (this.isAdmin()) {
      // Admin gets ALL overdue follow-ups across the entire organization
      const url = `${apiBase}/followup/admin/escalations`;
      this.http.get<FollowUpAdminEscalationDto[]>(url).subscribe({
        next: (list) => {
          if (Array.isArray(list)) {
            this.signalR.adminEscalations.set(list);
          }
        },
        error: () => {},
      });
    } else if (user?.id) {
      // Particular user gets ONLY their own overdue follow-ups
      const url = `${apiBase}/followup/user/${user.id}/overdue`;
      this.http.get<FollowUpPopupEventDto[]>(url).subscribe({
        next: (list) => {
          if (Array.isArray(list)) {
            this.signalR.userOverdueList.set(list);
          }
        },
        error: () => {},
      });
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
        notes: 'Follow-up marked completed from Dashboard',
        isCallLogged: true,
        callDurationSeconds: 60,
      })
      .subscribe();
  }

  protected navigateToAllOverdue(): void {
    void this.router.navigate(['/overdue-followups']);
  }
}
