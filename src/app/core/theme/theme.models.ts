export type ThemePresetId = 'light' | 'dark' | 'blue';

export interface ThemeColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

export interface ThemeTokens extends ThemeColors {
  navbarText: string;
  sidebarText: string;
  bodyBg: string;
  surface: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
}

export const THEME_STORAGE_KEY = 'crm-theme-v1';
