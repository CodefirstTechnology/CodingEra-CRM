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

/** Sidebar rail — keyed per preset (Light uses bright chrome; Dark/Blue use tinted rails). */
const SIDEBAR_RAIL: Record<
  ThemePresetId,
  { bg: string; border: string; muted: string; strong: string }
> = {
  light: {
    bg: '#ffffff',
    border: '#e2e8f0',
    muted: '#64748b',
    strong: '#0f172a',
  },
  dark: {
    bg: '#020617',
    border: 'rgb(148 163 184 / 0.12)',
    muted: '#94a3b8',
    strong: '#f1f5f9',
  },
  blue: {
    bg: '#172554',
    border: 'rgb(191 219 254 / 0.16)',
    muted: '#93c5fd',
    strong: '#eff6ff',
  },
};

const SURFACE: Record<ThemePresetId, SurfaceTokens> = {
  light: {
    navbarText: '#0f172a',
    sidebarText: '#334155',
    bodyBg: '#f1f5f9',
    surface: '#ffffff',
    cardBorder: '#e2e8f0',
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
    secondary: '#f8fafc',
    tertiary: '#2563eb',
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

    this.flushSidebarRailTokens(root);
    this.flushDashboardAccentTokens(root);

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

  /** Sidebar rail: preset base colors + accent-aware hover/active (tracks tertiary / brand). */
  private flushSidebarRailTokens(root: HTMLElement): void {
    const mode = this.surfaceMode();
    const rail = SIDEBAR_RAIL[mode];
    const tertiary = this.tertiary();
    const secondary = this.secondary();
    const primary = this.primary();

    let bg = rail.bg;
    if (mode === 'dark') {
      bg = `color-mix(in srgb, ${secondary} 94%, ${tertiary} 6%)`;
    } else if (mode === 'blue') {
      bg = `color-mix(in srgb, ${secondary} 82%, ${primary} 18%)`;
    }

    root.style.setProperty('--sidebar-rail-bg', bg);
    if (mode === 'light') {
      root.style.setProperty(
        '--sidebar-rail-border',
        `color-mix(in srgb, ${tertiary} 22%, #cbd5e1)`,
      );
    } else {
      root.style.setProperty('--sidebar-rail-border', rail.border);
    }
    root.style.setProperty('--sidebar-rail-muted', rail.muted);
    root.style.setProperty('--sidebar-rail-strong', rail.strong);

    if (mode === 'light') {
      root.style.setProperty(
        '--sidebar-rail-hover-bg',
        `color-mix(in srgb, ${tertiary} 12%, rgb(15 23 42 / 0.06))`,
      );
      root.style.setProperty(
        '--sidebar-rail-active-bg',
        `color-mix(in srgb, ${tertiary} 20%, rgb(15 23 42 / 0.06))`,
      );
    } else {
      root.style.setProperty(
        '--sidebar-rail-hover-bg',
        `color-mix(in srgb, ${tertiary} 13%, rgb(255 255 255 / 0.05))`,
      );
      root.style.setProperty(
        '--sidebar-rail-active-bg',
        `color-mix(in srgb, ${tertiary} 26%, transparent)`,
      );
    }
  }

  /** Monthly target KPI card + export button — follows surface mode + accent color */
  private flushDashboardAccentTokens(root: HTMLElement): void {
    const mode = this.surfaceMode();
    const s = SURFACE[mode];
    const t = this.tertiary();

    if (mode === 'light') {
      root.style.setProperty('--dash-emphasis-bg', '#ffffff');
      root.style.setProperty(
        '--dash-emphasis-border',
        `color-mix(in srgb, ${t} 32%, ${s.cardBorder})`,
      );
      root.style.setProperty('--dash-emphasis-text', s.textPrimary);
      root.style.setProperty('--dash-emphasis-muted', s.textMuted);
      root.style.setProperty(
        '--dash-emphasis-divider',
        `color-mix(in srgb, ${t} 22%, ${s.cardBorder})`,
      );
      root.style.setProperty('--dash-emphasis-gauge-track', 'rgb(148 163 184 / 0.55)');
      root.style.setProperty('--dash-export-btn-bg', s.textPrimary);
      root.style.setProperty('--dash-export-btn-fg', '#ffffff');
    } else if (mode === 'dark') {
      root.style.setProperty(
        '--dash-emphasis-bg',
        `color-mix(in srgb, ${t} 22%, #111827)`,
      );
      root.style.setProperty(
        '--dash-emphasis-border',
        `color-mix(in srgb, ${t} 38%, #475569)`,
      );
      root.style.setProperty('--dash-emphasis-text', '#ffffff');
      root.style.setProperty('--dash-emphasis-muted', 'rgb(255 255 255 / 0.62)');
      root.style.setProperty('--dash-emphasis-divider', 'rgb(255 255 255 / 0.12)');
      root.style.setProperty('--dash-emphasis-gauge-track', '#52525b');
      root.style.setProperty('--dash-export-btn-bg', '#f1f5f9');
      root.style.setProperty('--dash-export-btn-fg', '#0f172a');
    } else {
      root.style.setProperty(
        '--dash-emphasis-bg',
        `color-mix(in srgb, ${t} 42%, #172554)`,
      );
      root.style.setProperty(
        '--dash-emphasis-border',
        `color-mix(in srgb, ${t} 45%, #1e40af)`,
      );
      root.style.setProperty('--dash-emphasis-text', '#eff6ff');
      root.style.setProperty('--dash-emphasis-muted', 'rgb(255 255 255 / 0.68)');
      root.style.setProperty('--dash-emphasis-divider', 'rgb(191 219 254 / 0.28)');
      root.style.setProperty('--dash-emphasis-gauge-track', 'rgb(71 85 105 / 0.95)');
      root.style.setProperty('--dash-export-btn-bg', '#eff6ff');
      root.style.setProperty('--dash-export-btn-fg', '#1e3a8a');
    }
  }
}
