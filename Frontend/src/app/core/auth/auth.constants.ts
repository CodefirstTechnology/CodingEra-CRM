/** Primary keys used by the CRM auth layer */
export const AUTH_TOKEN_KEY = 'crm.auth.token';
export const AUTH_USER_KEY = 'crm.auth.user';

/** Extra keys to clear on sign-out (legacy / alternate clients) */
export const AUTH_LEGACY_KEYS = [
  'token',
  'jwt',
  'access_token',
  'refresh_token',
  'auth_token',
  'id_token',
] as const;
