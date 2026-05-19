import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { userIdQueryInterceptor } from './core/http/user-id-query.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Default XHR backend so `/api/*` requests are handled by `proxy.conf.json` during `ng serve`.
    // `withFetch()` can return the SPA `index.html` for API routes (JSON parse error, status 200).
    provideHttpClient(withInterceptors([userIdQueryInterceptor])),
    provideRouter(routes),
  ],
};
