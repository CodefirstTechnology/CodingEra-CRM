import type { UserPermission } from './permission.models';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
  /** `users.role_id` from database — dynamic role FK. */
  roleId: number;
  /** Effective permissions loaded from RBAC (session / login). */
  permissions?: UserPermission[];
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
