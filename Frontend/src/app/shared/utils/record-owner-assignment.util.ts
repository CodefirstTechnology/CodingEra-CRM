/** Admin dashboard + assign permission → pick any owner on create. */
export function showOwnerPickerOnCreate(canAssign: boolean, isAdminSession: boolean): boolean {
  return canAssign && isAdminSession;
}

/** User dashboard / self_assign → read-only owner chip on create (matches legacy production). */
export function showSelfAssignedOwnerOnCreate(
  canAssign: boolean,
  isAdminSession: boolean,
): boolean {
  return !showOwnerPickerOnCreate(canAssign, isAdminSession);
}

/** Resolves lead/deal owner on create or update. */
export function resolveRecordOwnerIdForSubmit(options: {
  canAssign: boolean;
  isAdminSession: boolean;
  rawOwnerId: string;
  existingOwnerId?: string | null;
  sessionOwnerId: string;
  fallbackOwnerId: string;
}): string {
  const canPickOwner = options.canAssign && options.isAdminSession;

  if (canPickOwner) {
    return options.rawOwnerId.trim() || options.fallbackOwnerId.trim();
  }

  const existing = options.existingOwnerId?.trim();
  if (existing) {
    return existing;
  }

  const session = options.sessionOwnerId.trim();
  if (session) {
    return session;
  }

  return options.fallbackOwnerId.trim() || options.rawOwnerId.trim();
}
