/** Config for a table that uses persisted column order. */
export interface ColumnOrderConfig {
  /** Storage key prefix, e.g. `crm.leadsColumnOrder` (userId appended by storage). */
  storageKeyPrefix: string;
  /** Default / reset order (canonical preferred columns). */
  preferredOrder: readonly string[];
  /** Current user id for per-user persistence; omit for shared key. */
  getUserId: () => string | null | undefined;
}

/** Payload when the user drops a column in a new position. */
export interface ColumnReorderEvent {
  fromIndex: number;
  toIndex: number;
}
