export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
  /** `users.role_id` — `1` User, `2` Admin. */
  roleId: number;
}

/** Sent to POST /auth/register — password is never persisted on the client. */
export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  /** Maps to Swagger `roleId` (e.g. `1` for default “User” role in master data). Omit/null if the API assigns a default. */
  roleId?: number | null;
}

/** Body for `POST /api/auth/register` per Swagger `RegisterRequest`. */
export interface RegisterApiRequest {
  fullName: string;
  email: string;
  phone?: string | null;
  password: string;
  roleId?: number | null;
}
