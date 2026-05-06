export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Sent to POST /auth/register — password is never persisted on the client. Role is always `User`. */
export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}
