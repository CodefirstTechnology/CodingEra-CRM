import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, map, of, take, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { SKIP_USER_ID_QUERY } from '../http/skip-user-id-query.context';
import type { CompanyProfile } from './company-profile/company-profile-api.models';
import { CompanyProfileHttpService } from './company-profile/company-profile-http.service';

const STORAGE_KEY = 'crm_company_branding';

interface CompanyBrandingState {
  brandName: string;
  companyName: string;
  tagline: string;
  logoContentType: string;
  logoBase64: string | null;
  faviconContentType: string;
  faviconBase64: string | null;
}

function readBrandingField(o: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = o[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

function mapBrandingPayload(raw: unknown): CompanyBrandingState | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let o = raw as Record<string, unknown>;
  for (const key of ['data', 'Data', 'result', 'Result']) {
    const inner = o[key];
    if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
      o = inner as Record<string, unknown>;
      break;
    }
  }

  const logoBase64 = readBrandingField(o, ['logoBase64', 'LogoBase64']).trim();
  const faviconBase64 = readBrandingField(o, ['faviconBase64', 'FaviconBase64']).trim();
  return {
    brandName: readBrandingField(o, ['brandName', 'BrandName']).trim(),
    companyName: readBrandingField(o, ['companyName', 'CompanyName']).trim(),
    tagline: readBrandingField(o, ['tagline', 'Tagline']).trim(),
    logoContentType: readBrandingField(o, ['logoContentType', 'LogoContentType']).trim(),
    logoBase64: logoBase64 || null,
    faviconContentType: readBrandingField(o, ['faviconContentType', 'FaviconContentType']).trim(),
    faviconBase64: faviconBase64 || null,
  };
}

@Injectable({ providedIn: 'root' })
export class CompanyBrandingService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly companyProfileApi = inject(CompanyProfileHttpService);

  private readonly brandName = signal('');
  private readonly companyName = signal('');
  private readonly tagline = signal('');
  private readonly logoContentType = signal('');
  private readonly logoBase64 = signal<string | null>(null);
  private readonly faviconContentType = signal('');
  private readonly faviconBase64 = signal<string | null>(null);

  readonly logoUrl = computed(() => {
    const base64 = this.logoBase64();
    const contentType = this.logoContentType();
    if (base64 && contentType) return `data:${contentType};base64,${base64}`;
    return null;
  });

  readonly faviconUrl = computed(() => {
    const base64 = this.faviconBase64();
    const contentType = this.faviconContentType();
    if (base64 && contentType) return `data:${contentType};base64,${base64}`;
    return null;
  });

  readonly brandLabel = computed(() => {
    const brand = this.brandName().trim();
    const company = this.companyName().trim();
    return brand || company || 'CRM';
  });

  readonly taglineLabel = computed(() => this.tagline().trim());

  readonly hasLogo = computed(() => !!this.logoUrl());

  init(): void {
    this.restoreFromStorage();
    this.applyToDocument();
    this.refresh();
  }

  applyFromProfile(profile: CompanyProfile): void {
    this.applyBranding({
      brandName: profile.brandName,
      companyName: profile.companyName,
      tagline: profile.tagline,
      logoContentType: profile.logoContentType,
      logoBase64: profile.logoBase64,
      faviconContentType: profile.faviconContentType,
      faviconBase64: profile.faviconBase64,
    });
  }

  refresh(): void {
    if (this.auth.token()) {
      this.companyProfileApi
        .get()
        .pipe(
          take(1),
          tap((profile) => this.applyFromProfile(profile)),
          catchError(() => of(null)),
        )
        .subscribe();
      return;
    }

    this.fetchPublicBranding().pipe(take(1)).subscribe();
  }

  private fetchPublicBranding() {
    const base = environment.apiUrl.replace(/\/$/, '');
    return this.http
      .get<unknown>(`${base}/company-profile/branding`, {
        context: new HttpContext().set(SKIP_USER_ID_QUERY, true),
      })
      .pipe(
        map((raw) => mapBrandingPayload(raw)),
        tap((branding) => {
          if (branding) this.applyBranding(branding);
        }),
        catchError(() => of(null)),
      );
  }

  private applyBranding(branding: CompanyBrandingState): void {
    this.brandName.set(branding.brandName);
    this.companyName.set(branding.companyName);
    this.tagline.set(branding.tagline);
    this.logoContentType.set(branding.logoContentType);
    this.logoBase64.set(branding.logoBase64);
    this.faviconContentType.set(branding.faviconContentType);
    this.faviconBase64.set(branding.faviconBase64);
    this.persistToStorage(branding);
    this.applyToDocument();
  }

  private applyToDocument(): void {
    const label = this.brandLabel();
    document.title = label === 'CRM' ? 'CRM Pro' : `${label} · CRM`;

    const favicon = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (!favicon) return;

    const faviconUrl = this.faviconUrl();
    if (faviconUrl) {
      favicon.type = this.faviconContentType() || 'image/png';
      favicon.href = faviconUrl;
      return;
    }

    favicon.type = 'image/x-icon';
    favicon.href = 'favicon.ico';
  }

  private persistToStorage(branding: CompanyBrandingState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(branding));
    } catch {
      /* ignore quota errors */
    }
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CompanyBrandingState;
      if (!parsed || typeof parsed !== 'object') return;
      this.applyBranding({
        brandName: String(parsed.brandName ?? ''),
        companyName: String(parsed.companyName ?? ''),
        tagline: String(parsed.tagline ?? ''),
        logoContentType: String(parsed.logoContentType ?? ''),
        logoBase64: parsed.logoBase64 ? String(parsed.logoBase64) : null,
        faviconContentType: String(parsed.faviconContentType ?? ''),
        faviconBase64: parsed.faviconBase64 ? String(parsed.faviconBase64) : null,
      });
    } catch {
      /* ignore corrupt cache */
    }
  }
}
