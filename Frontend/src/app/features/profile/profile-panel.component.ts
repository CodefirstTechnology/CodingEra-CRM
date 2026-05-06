import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilePanelService } from '../../core/profile/profile-panel.service';

@Component({
  selector: 'app-profile-panel',
  imports: [],
  templateUrl: './profile-panel.component.html',
  styleUrl: './profile-panel.component.scss',
})
export class ProfilePanelComponent {
  protected readonly panel = inject(ProfilePanelService);
  protected readonly auth = inject(AuthService);

  protected close(): void {
    this.panel.close();
  }

  protected onBackdropClick(): void {
    this.close();
  }

  protected signOut(): void {
    void this.auth.signOut();
  }

  protected avatarInitial(): string {
    const u = this.auth.user();
    const s = (u?.name?.trim() || u?.email?.trim() || '?').trim();
    return s.charAt(0).toUpperCase();
  }
}
