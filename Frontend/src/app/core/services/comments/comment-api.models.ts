import type { ActivityEntityType } from '../activities/activity-api.models';

export interface CommentUpsertDto {
  id?: number;
  entityType: ActivityEntityType | string;
  entityId: number;
  authorId?: number | null;
  body: string;
}

export interface EntityCommentItem {
  id: string;
  authorId: number | null;
  authorName: string;
  authorInitial: string;
  body: string;
  whenLabel: string;
  createdAt: string;
}

export interface CommentListQuery {
  entityType: ActivityEntityType;
  entityId: number;
  userId?: number;
}
