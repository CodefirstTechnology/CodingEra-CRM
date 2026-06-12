import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { isAdmin } from '../../core/auth/auth-role.util';
import { ProfilePanelService } from '../../core/profile/profile-panel.service';
import { MorningBriefingVoiceService } from '../user-dashboard/services/morning-briefing-voice.service';

@Component({
  selector: 'app-profile-panel',
  imports: [],
  templateUrl: './profile-panel.component.html',
  styleUrl: './profile-panel.component.scss',
})
export class ProfilePanelComponent {
  protected readonly panel = inject(ProfilePanelService);
  protected readonly auth = inject(AuthService);
  protected readonly briefing = inject(MorningBriefingVoiceService);
  private readonly router = inject(Router);

  protected readonly showBriefingPref = computed(() => isAdmin(this.auth.user()));
  protected readonly briefingBusy = computed(
    () => this.briefing.state() === 'loading' || this.briefing.state() === 'speaking',
  );

  constructor() {
    this.briefing.loadPreferences();
  }

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

  protected onBriefingToggle(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.briefing.setEnabled(checked);
  }

  protected playBriefingNow(): void {
    this.briefing.playNow();
  }

  protected regenerateBriefing(): void {
    this.briefing.playNow(true);
  }

  protected resetBriefingForTesting(): void {
    this.briefing.resetForTesting(true);
  }
}
