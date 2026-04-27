import { Component, inject } from '@angular/core';
import { ProfilePanelService } from '../../core/profile/profile-panel.service';

@Component({
  selector: 'app-profile-panel',
  imports: [],
  templateUrl: './profile-panel.component.html',
  styleUrl: './profile-panel.component.scss',
})
export class ProfilePanelComponent {
  protected readonly panel = inject(ProfilePanelService);

  protected close(): void {
    this.panel.close();
  }

  protected onBackdropClick(): void {
    this.close();
  }
}
