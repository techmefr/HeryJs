import { canonicalJson } from '#technical/audit/canonical-json';
import { historyColumnsOf } from './history-columns';
import type { FieldChange, Snapshot } from './history.types';

/**
 * The record reduced to the columns its model registered, as plain JSON. A
 * date becomes its ISO string here, so what is stored, what a diff compares and
 * what a route returns are the same value rather than three renderings of it.
 */
export function snapshotOf(
  model: string,
  record: Record<string, unknown>,
): Snapshot | null {
  const columns = historyColumnsOf(model);

  if (columns === null) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        columns
          .filter((column) => column in record)
          .map((column) => [column, record[column]]),
      ),
    ),
  ) as Snapshot;
}

export function diffSnapshots(
  before: Snapshot,
  after: Snapshot,
): FieldChange[] {
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  return fields
    .filter(
      (field) => canonicalJson(before[field]) !== canonicalJson(after[field]),
    )
    .sort()
    .map((field) => ({
      field,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));
}

/**
 * What putting a snapshot back writes: only the fields the caller names as
 * revertible, and only those the snapshot actually holds. A column added to the
 * resource after the snapshot was taken is left as it is instead of being
 * overwritten with a value the snapshot never had.
 */
export function revertPatchOf(
  snapshot: Snapshot,
  revertible: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    revertible
      .filter((field) => field in snapshot)
      .map((field) => [field, snapshot[field]]),
  );
}
