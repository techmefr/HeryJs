export const HISTORY_OPERATIONS = [
  'create',
  'update',
  'delete',
  'restore',
  'revert',
] as const;

export type HistoryOperation = (typeof HISTORY_OPERATIONS)[number];

export type Snapshot = Record<string, unknown>;

export interface HistoryEntry {
  id: string;
  sequence: number;
  operation: string;
  userId: string | null;
  impersonatedBy: string | null;
  createdAt: Date;
  snapshot: Snapshot;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  nextBefore: number | null;
}
