import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilePanelService } from '../../core/profile/profile-panel.service';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'app-profile-panel',
  imports: [],
  templateUrl: './profile-panel.component.html',
  styleUrl: './profile-panel.component.scss',
})
export class ProfilePanelComponent {
  protected readonly panel = inject(ProfilePanelService);
  protected readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  protected readonly showAdvancedSettings = computed(
    () => this.permissions.hasAny(['settings.view', 'settings.manage', 'roles.view']),
  );

  protected close(): void {
    this.panel.close();
  }

  protected onBackdropClick(): void {
    this.close();
  }

  protected signOut(): void {
    void this.auth.signOut();
  }

  protected openAdvancedSettings(): void {
    this.close();
    void this.router.navigateByUrl('/advanced-settings');
  }

  protected avatarInitial(): string {
    const u = this.auth.user();
    const s = (u?.name?.trim() || u?.email?.trim() || '?').trim();
    return s.charAt(0).toUpperCase();
  }
}
