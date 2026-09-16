import type {
  ImportOutcome,
  ImportRow,
  ImportRowError,
} from '#kernel/import/import-driver';

export interface PartitionedRows {
  valid: ImportRow[];
  errors: ImportRowError[];
}

/**
 * The gate between a parsed file and the `Importable`. A row whose columns do
 * not match the declared ones is neither dropped nor handed on: dropping it
 * leaves the user with a success message and fewer records than they uploaded,
 * and handing it on makes every `consume` re-derive the same shape check with
 * whatever the driver happened to produce.
 *
 * Both directions are checked. A missing column is the obvious mistake; an
 * extra one is the expensive one, because it is what a renamed header looks
 * like -- the file still parses, the intended column arrives empty, and the
 * import quietly blanks a field across every row.
 */
export function partitionRows(
  rows: ImportRow[],
  columns: readonly string[],
): PartitionedRows {
  const valid: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  rows.forEach((row, index) => {
    const position = index + 1;
    const rowErrors = shapeErrors(row, columns, position);

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    valid.push(row);
  });

  return { valid, errors };
}

function shapeErrors(
  row: ImportRow,
  columns: readonly string[],
  position: number,
): ImportRowError[] {
  const present = new Set(Object.keys(row));
  const expected = new Set(columns);

  const missing = columns
    .filter((column) => !present.has(column))
    .map((column) => ({
      row: position,
      column,
      message: `Column "${column}" is declared by the import but absent from the file.`,
    }));

  const unexpected = [...present]
    .filter((column) => !expected.has(column))
    .map((column) => ({
      row: position,
      column,
      message: `Column "${column}" is not declared by the import. Expected: ${columns.join(', ')}.`,
    }));

  return [...missing, ...unexpected];
}

/**
 * Rows rejected on shape never reached `consume`, so the counts it reports
 * cover only what it saw. Merging here rather than inside every `Importable`
 * is what lets a caller trust that accepted plus rejected equals the number of
 * rows the file actually held.
 */
export function mergeOutcome(
  consumed: ImportOutcome,
  rejected: ImportRowError[],
  rejectedRows: number,
): ImportOutcome {
  return {
    accepted: consumed.accepted,
    rejected: consumed.rejected + rejectedRows,
    errors: [...rejected, ...consumed.errors],
  };
}
