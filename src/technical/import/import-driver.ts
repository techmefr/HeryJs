/**
 * The mirror of `export-driver.ts`: export turns records into a file, import
 * turns an uploaded file back into records. Same four pieces, same token
 * factory, and the same per-call selection -- the format is a property of the
 * file the user just uploaded, so it belongs in the call rather than in config.
 *
 * The contract stays in the kernel for the reason mail's and export's do: a
 * driver package cannot import a module, and a sibling import only resolves
 * once both happen to be installed.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const IMPORT_MODULE = 'import';

export function importDriverToken(driverName: string): symbol {
  return driverToken(IMPORT_MODULE, driverName);
}

/**
 * Export's queued path can rebuild everything it needs from plain data, because
 * rendering lives on the driver. Import's cannot: `consume` is application code,
 * and no queue carries a closure. So a queued import travels as the name of an
 * `Importable` and the worker looks the instance up, through the same global
 * symbol registry the drivers use -- one mechanism, not two.
 */
export function importableToken(name: string): symbol {
  return Symbol.for(`heryjs:importable:${name}`);
}

/**
 * The same shape as `ExportRow`, deliberately: a file that was exported and
 * handed back edited must round-trip through the two modules without either
 * side converting. A parser reports what the cell held, not what the caller's
 * model wants it to be -- widening a column into a domain type is the
 * `Importable`'s job, where the domain is actually known.
 */
export type ImportRow = Record<string, string | number | boolean | null>;

export interface ImportDriver {
  /** The extension this driver accepts, without the dot: `csv`, `xlsx`. */
  readonly extension: string;
  readonly contentType: string;
  parse(body: Buffer): Promise<ImportRow[]>;
}

export interface ImportRowError {
  /** 1-based index into the data rows, so it matches what a spreadsheet shows. */
  row: number;
  column: string | null;
  message: string;
}

/**
 * An import is partially successful far more often than it is either, so the
 * outcome is a report rather than a boolean or a thrown exception. Throwing on
 * the first bad row makes a thousand-row file take a thousand uploads to fix,
 * and returning only a count makes the user guess which rows were the problem.
 *
 * `accepted` and `rejected` are counted separately instead of derived from
 * `errors.length`: several errors can land on one row, and a caller showing
 * "412 of 500 rows imported" must not have that number quietly drift with the
 * number of complaints.
 *
 * Rejected rows are never silently dropped and never blindly inserted -- every
 * one of them appears in `errors`, which is the difference between an import
 * that a user can correct and one they can only re-run and hope.
 */
export interface ImportOutcome {
  accepted: number;
  rejected: number;
  errors: ImportRowError[];
}

/**
 * What `hery make:import` generates, and the counterpart of `Exportable`. It
 * says which columns the file must carry and what to do with the rows that
 * arrive; it never names a format, so the same TaskListImport accepts CSV and
 * XLSX unchanged.
 *
 * `columns` is explicit for the reason `Exportable.columns` is: derived from
 * the first row's keys, a file missing a column would import as though that
 * column had never been required, and a file carrying an extra one would pass
 * unnoticed into whatever `consume` does with it.
 *
 * `consume` only ever sees rows whose columns already match, so it may read
 * them directly. Everything it still rejects -- a duplicate key, a value the
 * domain refuses -- it reports through its own `ImportOutcome`.
 */
export interface Importable {
  /** The key this importable binds under, so a queued import can name it. */
  readonly name: string;
  readonly columns: readonly string[];
  consume(rows: ImportRow[]): Promise<ImportOutcome>;
}
