import { z } from 'zod';

export const MAX_HISTORY_PAGE = 100;
export const DEFAULT_HISTORY_PAGE = 20;

export const historyListSchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_HISTORY_PAGE).optional(),
  before: z.number().int().positive().optional(),
});

export const historyDiffSchema = z.strictObject({
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64).optional(),
});

export const historyRestoreSchema = z.strictObject({
  snapshotId: z.string().min(1).max(64),
  version: z.number().int().positive().optional(),
});

export type HistoryListBody = z.infer<typeof historyListSchema>;
export type HistoryDiffBody = z.infer<typeof historyDiffSchema>;
export type HistoryRestoreBody = z.infer<typeof historyRestoreSchema>;
