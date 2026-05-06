/** Primary keys used by the CRM auth layer */
export const AUTH_TOKEN_KEY = 'crm.auth.token';
export const AUTH_USER_KEY = 'crm.auth.user';

/** Demo login only (`environment.apiUrl` empty). Not used for real API auth. */
export const DEMO_ADMIN_EMAIL = 'admin@gmail.com';
export const DEMO_ADMIN_PASSWORD = 'Admin@123';

/** Extra keys to clear on sign-out (legacy / alternate clients) */
export const AUTH_LEGACY_KEYS = [
  'token',
  'jwt',
  'access_token',
  'refresh_token',
  'auth_token',
  'id_token',
] as const;
