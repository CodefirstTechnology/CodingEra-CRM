import type { TaskPriority, TaskRow, TaskStatus } from '../../../features/tasks/tasks.component';
import { TextFormatter } from '../../../shared/utils/text-normalizer';
import {
  inboundDescription,
  inboundPerson,
  inboundTitle,
} from '../../../shared/utils/text-normalizer/inbound-format';

const TASK_STATUSES: TaskStatus[] = ['Backlog', 'Todo', 'In Progress', 'Done', 'Canceled'];
const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High'];

function formatAssigneeName(raw: string): string {
  const s = raw.trim();
  if (!s || /^User #\d+$/i.test(s)) return s;
  return inboundPerson(s) || s;
}

function readOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readAssignedUserId(r: Record<string, unknown>): number | null {
  for (const key of [
    'assignedToUserId',
    'AssignedToUserId',
    'assigneeUserId',
    'AssigneeUserId',
    'assignedUserId',
    'userId',
    'UserId',
  ]) {
    const n = readOptionalInt(r[key]);
    if (n != null && n > 0) return n;
  }
  const nested = r['assignedTo'] ?? r['assignee'];
  if (nested != null && typeof nested === 'object') {
    const o = nested as Record<string, unknown>;
    const n = readOptionalInt(o['id'] ?? o['userId'] ?? o['UserId']);
    if (n != null && n > 0) return n;
  }
  return null;
}

function readAssigneeLabel(r: Record<string, unknown>): string {
  for (const key of ['assignedTo', 'assignee', 'assignedToName', 'assigneeName']) {
    const v = r[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v != null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const name = String(o['name'] ?? o['fullName'] ?? o['label'] ?? '').trim();
      if (name) return name;
    }
  }
  const uid = readAssignedUserId(r);
  return uid != null ? `User #${uid}` : '';
}

function coerceStatus(raw: string | undefined | null): TaskStatus {
  const s = (raw ?? 'Backlog').trim();
  return (TASK_STATUSES.includes(s as TaskStatus) ? s : 'Backlog') as TaskStatus;
}

function coercePriority(raw: string | undefined | null): TaskPriority {
  const p = (raw ?? 'Low').trim();
  return (TASK_PRIORITIES.includes(p as TaskPriority) ? p : 'Low') as TaskPriority;
}

function formatLastModified(iso: string | undefined | null): string {
  if (iso == null || !String(iso).trim()) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'Just now';
  if (diff < 86_400_000) return 'Today';
  if (diff < 172_800_000) return 'Yesterday';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(t);
  } catch {
    return new Date(t).toLocaleDateString();
  }
}

export function extractTaskRecords(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ['data', 'items', 'value', 'result', 'tasks', 'Tasks']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export interface TaskUpsertDto {
  taskId?: number;
  taskTitle?: string | null;
  taskDescription?: string | null;
  taskStatus?: string | null;
  taskAssignee?: string | null;
  taskDueDate: string;
  taskPriority?: string | null;
  assigneeUserId?: number | null;
  relatedLeadId?: number | null;
  relatedDealId?: number | null;
}

function dueLocalOrIsoToIso(raw: string | undefined | null): string {
  const s = (raw ?? '').trim();
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

/** Merges a partial task patch onto an existing row so PUT does not clear omitted FKs. */
export function mergeTaskRowPatch(
  existing: TaskRow,
  patch: Partial<Omit<TaskRow, 'id'>>,
): Omit<TaskRow, 'id'> {
  return {
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    status: patch.status ?? existing.status,
    priority: patch.priority ?? existing.priority,
    dueDate: patch.dueDate ?? existing.dueDate,
    dueDateRaw: patch.dueDateRaw ?? existing.dueDateRaw,
    assignedTo: patch.assignedTo ?? existing.assignedTo,
    assignedInitials: patch.assignedInitials ?? existing.assignedInitials,
    assignedToUserId:
      patch.assignedToUserId !== undefined ? patch.assignedToUserId : existing.assignedToUserId,
    relatedLeadId:
      patch.relatedLeadId !== undefined ? patch.relatedLeadId : existing.relatedLeadId,
    relatedDealId:
      patch.relatedDealId !== undefined ? patch.relatedDealId : existing.relatedDealId,
    lastModified: patch.lastModified ?? existing.lastModified,
    relatedLeadName: existing.relatedLeadName,
    relatedDealName: existing.relatedDealName,
  };
}

/** Maps UI / form state to `POST|PUT /api/tasks` body (`TaskUpsertDto`). */
export function taskRowToUpsertDto(data: Omit<TaskRow, 'id'>, taskId?: number): TaskUpsertDto {
  const assigneeUserId = data.assignedToUserId ? readOptionalInt(data.assignedToUserId) : null;
  const relatedLeadId = data.relatedLeadId ? readOptionalInt(data.relatedLeadId) : null;
  const relatedDealId = data.relatedDealId ? readOptionalInt(data.relatedDealId) : null;

  return {
    taskId: taskId != null && taskId > 0 ? taskId : 0,
    taskTitle: TextFormatter.title(data.title) || '',
    taskDescription: data.description?.trim()
      ? TextFormatter.description(data.description)
      : null,
    taskStatus: data.status,
    taskAssignee: data.assignedTo?.trim()
      ? TextFormatter.personName(data.assignedTo)
      : null,
    taskDueDate: dueLocalOrIsoToIso(data.dueDateRaw),
    taskPriority: data.priority,
    assigneeUserId,
    relatedLeadId,
    relatedDealId,
  };
}

/** Maps `GET /api/tasks` records to {@link TaskRow} (includes `assignedToUserId` when API sends it). */
export function mapTaskApiRecord(raw: unknown): TaskRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = String(readOptionalInt(r['taskId']) ?? readOptionalInt(r['id']) ?? r['id'] ?? '');
  const assignedToUserId = readAssignedUserId(r);
  const taskAssignee = String(r['taskAssignee'] ?? r['TaskAssignee'] ?? '').trim();
  const assignedTo = formatAssigneeName(taskAssignee || readAssigneeLabel(r));
  const dueRaw = String(
    r['taskDueDate'] ?? r['TaskDueDate'] ?? r['dueDate'] ?? r['dueDateTime'] ?? r['DueDate'] ?? '',
  ).trim();
  const initials = String(r['assignedInitials'] ?? r['assigneeInitials'] ?? '').trim();

  return {
    id,
    title:
      inboundTitle(String(r['taskTitle'] ?? r['TaskTitle'] ?? r['title'] ?? r['name'] ?? '')) ||
      'Task',
    description: inboundDescription(
      String(r['taskDescription'] ?? r['TaskDescription'] ?? r['description'] ?? ''),
    ),
    status: coerceStatus(String(r['taskStatus'] ?? r['TaskStatus'] ?? r['status'] ?? '')),
    priority: coercePriority(String(r['taskPriority'] ?? r['TaskPriority'] ?? r['priority'] ?? '')),
    dueDate: dueRaw ? formatLastModified(dueRaw) : '—',
    dueDateRaw: dueRaw,
    assignedTo,
    assignedInitials: initials || (assignedTo ? assignedTo.slice(0, 2).toUpperCase() : '?'),
    lastModified: formatLastModified(
      String(r['lastModified'] ?? r['updatedAt'] ?? r['modifiedAt'] ?? ''),
    ),
    relatedLeadId:
      readOptionalInt(r['relatedLeadId'] ?? r['RelatedLeadId'] ?? r['leadId']) != null
        ? String(readOptionalInt(r['relatedLeadId'] ?? r['RelatedLeadId'] ?? r['leadId']))
        : undefined,
    relatedDealId:
      readOptionalInt(r['relatedDealId'] ?? r['RelatedDealId'] ?? r['dealId']) != null
        ? String(readOptionalInt(r['relatedDealId'] ?? r['RelatedDealId'] ?? r['dealId']))
        : undefined,
    assignedToUserId:
      assignedToUserId != null && assignedToUserId > 0 ? String(assignedToUserId) : undefined,
  };
}
