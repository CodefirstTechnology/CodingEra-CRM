import { HttpContextToken } from '@angular/common/http';

/**
 * When `true`, `userIdQueryInterceptor` will not append `?userId=`.
 * Use for bootstrap calls during login (e.g. `GET /auth/users`) while the session may still
 * hold a **previous** user's id — attaching that id would filter the list and break email lookup.
 */
export const SKIP_USER_ID_QUERY = new HttpContextToken<boolean>(() => false);
