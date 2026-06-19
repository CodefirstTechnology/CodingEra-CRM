import type {
  UserTargetRow,
  UserTargetSalesUser,
  UserTargetType,
  UserTargetWidget,
} from './user-target-api.models';

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return fallback;
}

function dateStr(v: unknown): string {
  return str(v).trim();
}

export function mapUserTargetType(raw: unknown): UserTargetType {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: num(r['id'] ?? r['Id']),
    name: str(r['name'] ?? r['Name']),
    description: str(r['description'] ?? r['Description']),
    sortOrder: num(r['sortOrder'] ?? r['SortOrder']),
    isActive: bool(r['isActive'] ?? r['IsActive'], true),
  };
}

export function mapUserTargetSalesUser(raw: unknown): UserTargetSalesUser {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: num(r['id'] ?? r['Id']),
    fullName: str(r['fullName'] ?? r['FullName']),
    email: str(r['email'] ?? r['Email']),
    roleName: str(r['roleName'] ?? r['RoleName']),
  };
}

export function mapUserTargetRow(raw: unknown): UserTargetRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: num(r['id'] ?? r['Id']),
    userId: num(r['userId'] ?? r['UserId']),
    userName: str(r['userName'] ?? r['UserName']),
    userEmail: str(r['userEmail'] ?? r['UserEmail']),
    targetTypeId: num(r['targetTypeId'] ?? r['TargetTypeId']),
    targetTypeName: str(r['targetTypeName'] ?? r['TargetTypeName']),
    targetAmount: num(r['targetAmount'] ?? r['TargetAmount']),
    startDate: dateStr(r['startDate'] ?? r['StartDate']),
    endDate: dateStr(r['endDate'] ?? r['EndDate']),
    isActive: bool(r['isActive'] ?? r['IsActive'], true),
    achievedAmount: num(r['achievedAmount'] ?? r['AchievedAmount']),
    remainingAmount: num(r['remainingAmount'] ?? r['RemainingAmount']),
    achievementPercent: num(r['achievementPercent'] ?? r['AchievementPercent']),
    achievedCalculatedAt: dateStr(r['achievedCalculatedAt'] ?? r['AchievedCalculatedAt']) || null,
    createdAt: dateStr(r['createdAt'] ?? r['CreatedAt']),
    updatedAt: dateStr(r['updatedAt'] ?? r['UpdatedAt']),
  };
}

export function mapUserTargetWidget(raw: unknown): UserTargetWidget {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    targetId: num(r['targetId'] ?? r['TargetId']),
    targetTypeName: str(r['targetTypeName'] ?? r['TargetTypeName']),
    targetAmount: num(r['targetAmount'] ?? r['TargetAmount']),
    achievedAmount: num(r['achievedAmount'] ?? r['AchievedAmount']),
    remainingAmount: num(r['remainingAmount'] ?? r['RemainingAmount']),
    achievementPercent: num(r['achievementPercent'] ?? r['AchievementPercent']),
    startDate: dateStr(r['startDate'] ?? r['StartDate']),
    endDate: dateStr(r['endDate'] ?? r['EndDate']),
    isActive: bool(r['isActive'] ?? r['IsActive'], true),
  };
}

export function toUserTargetBody(dto: {
  userId: number;
  targetTypeId: number;
  targetAmount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}): Record<string, unknown> {
  return {
    userId: dto.userId,
    targetTypeId: dto.targetTypeId,
    targetAmount: dto.targetAmount,
    startDate: dto.startDate,
    endDate: dto.endDate,
    isActive: dto.isActive,
  };
}

export function mapUserTargetRows(raw: unknown): UserTargetRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapUserTargetRow);
}
