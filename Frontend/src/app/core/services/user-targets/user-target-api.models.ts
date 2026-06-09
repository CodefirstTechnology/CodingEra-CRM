export interface UserTargetType {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface UserTargetSalesUser {
  id: number;
  fullName: string;
  email: string;
  roleName: string;
}

export interface UserTargetRow {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  targetTypeId: number;
  targetTypeName: string;
  targetAmount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  achievedAmount: number;
  remainingAmount: number;
  achievementPercent: number;
  achievedCalculatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserTargetUpsert {
  id?: number;
  userId: number;
  targetTypeId: number;
  targetAmount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface UserTargetMonitorQuery {
  search?: string;
  userId?: number;
  targetTypeId?: number;
  isActive?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface UserTargetWidget {
  targetId: number;
  targetTypeName: string;
  targetAmount: number;
  achievedAmount: number;
  remainingAmount: number;
  achievementPercent: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}
