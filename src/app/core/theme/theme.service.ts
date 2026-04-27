import { Injectable, computed, signal } from '@angular/core';
import { THEME_STORAGE_KEY, type ThemePresetId } from './theme.models';

/** Non-brand UI tokens keyed by “surface mode” (light / dark / blue). */
interface SurfaceTokens {
  navbarText: string;
  sidebarText: string;
  bodyBg: string;
  surface: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
}

const SURFACE: Record<ThemePresetId, SurfaceTokens> = {
  light: {
    navbarText: '#0f172a',
    sidebarText: '#94a3b8',
    bodyBg: '#f8f9fa',
    surface: '#ffffff',
    cardBorder: '#e8ecf1',
    textPrimary: '#0f172a',
    textMuted: '#64748b',
  },
  dark: {
    navbarText: '#f8fafc',
    sidebarText: '#cbd5e1',
    bodyBg: '#020617',
    surface: '#0f172a',
    cardBorder: '#1e293b',
    textPrimary: '#f1f5f9',
    textMuted: '#94a3b8',
  },
  blue: {
    navbarText: '#eff6ff',
    sidebarText: '#bfdbfe',
    bodyBg: '#eff6ff',
    surface: '#ffffff',
    cardBorder: '#dbeafe',
    textPrimary: '#1e3a8a',
    textMuted: '#3b82f6',
  },
};

/** Default brand colors per preset (navbar / sidebar / accents). */
const PRESET_BRAND: Record<ThemePresetId, { primary: string; secondary: string; tertiary: string }> = {
  light: {
    primary: '#ffffff',
    secondary: '#f8f9fa',
    tertiary: '#007bff',
  },
  dark: {
    primary: '#0f172a',
    secondary: '#020617',
    tertiary: '#38bdf8',
  },
  blue: {
    primary: '#1d4ed8',
    secondary: '#1e3a8a',
    tertiary: '#60a5fa',
  },
};

const DEFAULT_PRESET: ThemePresetId = 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly primary = signal(PRESET_BRAND[DEFAULT_PRESET].primary);
  readonly secondary = signal(PRESET_BRAND[DEFAULT_PRESET].secondary);
  readonly tertiary = signal(PRESET_BRAND[DEFAULT_PRESET].tertiary);
  /** Which surface palette is active (stays when user tweaks only brand colors). */
  readonly surfaceMode = signal<ThemePresetId>(DEFAULT_PRESET);

  /** Which full preset colors match exactly (null if customized). */
  readonly matchingPreset = computed<ThemePresetId | null>(() => {
    for (const id of ['light', 'dark', 'blue'] as const) {
      const p = PRESET_BRAND[id];
      if (
        p.primary === this.primary() &&
        p.secondary === this.secondary() &&
        p.tertiary === this.tertiary()
      ) {
        return id;
      }
    }
    return null;
  });

  /** Initialize from localStorage and apply to :root. Call once from App. */
  initFromStorage(): void {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (!raw) {
        this.applyPreset(DEFAULT_PRESET);
        return;
      }
      const data = JSON.parse(raw) as {
        primary?: string;
        secondary?: string;
        tertiary?: string;
        surfaceMode?: ThemePresetId;
      };
      const mode =
        data.surfaceMode && SURFACE[data.surfaceMode] ? data.surfaceMode : DEFAULT_PRESET;
      this.surfaceMode.set(mode);
      this.primary.set(data.primary ?? PRESET_BRAND[mode].primary);
      this.secondary.set(data.secondary ?? PRESET_BRAND[mode].secondary);
      this.tertiary.set(data.tertiary ?? PRESET_BRAND[mode].tertiary);
      this.flushToDocument();
    } catch {
      this.applyPreset(DEFAULT_PRESET);
    }
  }

  setPrimary(hex: string): void {
    this.primary.set(hex);
    this.persistAndApply();
  }

  setSecondary(hex: string): void {
    this.secondary.set(hex);
    this.persistAndApply();
  }

  setTertiary(hex: string): void {
    this.tertiary.set(hex);
    this.persistAndApply();
  }

  applyPreset(id: ThemePresetId): void {
    const b = PRESET_BRAND[id];
    this.surfaceMode.set(id);
    this.primary.set(b.primary);
    this.secondary.set(b.secondary);
    this.tertiary.set(b.tertiary);
    this.persistAndApply();
  }

  resetToDefault(): void {
    this.applyPreset(DEFAULT_PRESET);
  }

  private persistAndApply(): void {
    this.persist();
    this.flushToDocument();
  }

  private persist(): void {
    const payload = {
      primary: this.primary(),
      secondary: this.secondary(),
      tertiary: this.tertiary(),
      surfaceMode: this.surfaceMode(),
    };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));
  }

  private flushToDocument(): void {
    const root = document.documentElement;
    const s = SURFACE[this.surfaceMode()];

    root.style.setProperty('--primary-color', this.primary());
    root.style.setProperty('--secondary-color', this.secondary());
    root.style.setProperty('--tertiary-color', this.tertiary());

    root.style.setProperty('--navbar-text', s.navbarText);
    root.style.setProperty('--sidebar-text', s.sidebarText);
    root.style.setProperty('--body-bg', s.bodyBg);
    root.style.setProperty('--surface', s.surface);
    root.style.setProperty('--card-border', s.cardBorder);
    root.style.setProperty('--text-primary', s.textPrimary);
    root.style.setProperty('--text-muted', s.textMuted);

    root.style.setProperty('--chart-1', this.tertiary());
    root.style.setProperty(
      '--chart-2',
      `color-mix(in srgb, ${this.tertiary()} 65%, ${this.primary()} 35%)`,
    );
    root.style.setProperty(
      '--chart-3',
      `color-mix(in srgb, ${this.tertiary()} 40%, ${this.secondary()} 60%)`,
    );
  }
}
