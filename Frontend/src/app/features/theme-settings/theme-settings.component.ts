import { Component, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ThemeService } from '../../core/theme/theme.service';
import { ThemePanelService } from '../../core/theme/theme-panel.service';
import type { ThemePresetId } from '../../core/theme/theme.models';

@Component({
  selector: 'app-theme-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './theme-settings.component.html',
  styleUrl: './theme-settings.component.scss',
})
export class ThemeSettingsComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly theme = inject(ThemeService);
  protected readonly panel = inject(ThemePanelService);

  protected readonly presets: ThemePresetId[] = ['light', 'dark', 'blue'];

  protected readonly brandForm = this.fb.nonNullable.group({
    primary: ['#ffffff', [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]],
    secondary: ['#f8fafc', [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]],
    tertiary: ['#2563eb', [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]],
  });

  constructor() {
    effect(() => {
      if (!this.panel.open()) return;
      untracked(() => {
        this.brandForm.patchValue(
          {
            primary: this.theme.primary(),
            secondary: this.theme.secondary(),
            tertiary: this.theme.tertiary(),
          },
          { emitEvent: false },
        );
      });
    });

    this.brandForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.brandForm.invalid) return;
      const v = this.brandForm.getRawValue();
      this.theme.setPrimary(v.primary);
      this.theme.setSecondary(v.secondary);
      this.theme.setTertiary(v.tertiary);
    });
  }

  protected close(): void {
    this.panel.close();
  }

  protected onBackdropKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      this.close();
    }
  }

  protected applyPreset(id: ThemePresetId): void {
    this.theme.applyPreset(id);
    this.brandForm.patchValue(
      {
        primary: this.theme.primary(),
        secondary: this.theme.secondary(),
        tertiary: this.theme.tertiary(),
      },
      { emitEvent: false },
    );
  }

  protected reset(): void {
    this.theme.resetToDefault();
    this.brandForm.patchValue(
      {
        primary: this.theme.primary(),
        secondary: this.theme.secondary(),
        tertiary: this.theme.tertiary(),
      },
      { emitEvent: false },
    );
  }

  protected presetLabel(id: ThemePresetId): string {
    return id.charAt(0).toUpperCase() + id.slice(1) + ' theme';
  }

  protected isPresetActive(id: ThemePresetId): boolean {
    return this.theme.matchingPreset() === id;
  }
}
