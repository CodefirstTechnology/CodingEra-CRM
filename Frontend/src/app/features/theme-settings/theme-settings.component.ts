import { Component, inject } from '@angular/core';
import { ThemeService } from '../../core/theme/theme.service';
import { ThemePanelService } from '../../core/theme/theme-panel.service';
import type { ThemePresetId } from '../../core/theme/theme.models';

@Component({
  selector: 'app-theme-settings',
  imports: [],
  templateUrl: './theme-settings.component.html',
  styleUrl: './theme-settings.component.scss',
})
export class ThemeSettingsComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly panel = inject(ThemePanelService);

  protected readonly presets: ThemePresetId[] = ['light', 'dark', 'blue'];

  protected close(): void {
    this.panel.close();
  }

  protected onBackdropKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      this.close();
    }
  }

  protected pickPrimary(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.theme.setPrimary(v);
  }

  protected pickSecondary(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.theme.setSecondary(v);
  }

  protected pickTertiary(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.theme.setTertiary(v);
  }

  protected applyPreset(id: ThemePresetId): void {
    this.theme.applyPreset(id);
  }

  protected reset(): void {
    this.theme.resetToDefault();
  }

  protected presetLabel(id: ThemePresetId): string {
    return id.charAt(0).toUpperCase() + id.slice(1) + ' theme';
  }

  protected isPresetActive(id: ThemePresetId): boolean {
    return this.theme.matchingPreset() === id;
  }
}
