/** Access scope for a permission (matches backend AccessScope enum). */
export type AccessScope = 'own' | 'team' | 'all';

export const ACCESS_SCOPE_OWN = 0;
export const ACCESS_SCOPE_TEAM = 1;
export const ACCESS_SCOPE_ALL = 2;

export interface UserPermission {
  code: string;
  module: string;
  action: string;
  accessScope: AccessScope;
}

export interface PermissionDefinition {
  id: number;
  module: string;
  action: string;
  code: string;
  description: string;
}

export interface PermissionModuleGroup {
  module: string;
  permissions: PermissionDefinition[];
}

export interface RoleListItem {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  assignedUserCount: number;
  createdAt?: string;
}

export interface RolePermissionAssignment {
  permissionId: number;
  code: string;
  accessScope: AccessScope | number;
}

export interface RoleDetail {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  assignedUserCount: number;
  permissions: RolePermissionAssignment[];
}
