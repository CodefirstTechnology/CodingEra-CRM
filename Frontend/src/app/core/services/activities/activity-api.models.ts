export type ActivityEntityType = 'lead' | 'deal' | 'contact' | 'organization';

export interface ActivityApiRecord {
  id: number;
  entityType: ActivityEntityType | string;
  entityId: number;
  actionType: string;
  actorUserId: number | null;
  actorName: string;
  message: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  relatedRecordType: string | null;
  relatedRecordId: number | null;
  createdAt: string;
}

export interface ActivityRow extends ActivityApiRecord {
  whenLabel: string;
}

export interface ActivityGroup {
  id: string;
  actorName: string;
  actorUserId: number | null;
  createdAt: string;
  whenLabel: string;
  items: ActivityRow[];
  iconKind: 'people' | 'bolt' | 'edit' | 'comment';
}

export interface ActivityListQuery {
  entityType?: ActivityEntityType;
  entityId?: number;
  userId?: number;
}
