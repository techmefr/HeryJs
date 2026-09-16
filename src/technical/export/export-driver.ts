/**
 * The counterpart of `mail-driver.ts`, and deliberately the same shape: a
 * contract and a token factory in the kernel, drivers shipped as packages, a
 * registry in the module. What differs is selection -- mail has one active
 * driver chosen by config, export has several chosen per call -- and that
 * difference lives in the registry, not here.
 *
 * The contract stays in the kernel for the same reason mail's does: a driver
 * package cannot import a module, and a sibling import only resolves once
 * both are installed.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const EXPORT_MODULE = 'export';

export function exportDriverToken(driverName: string): symbol {
  return driverToken(EXPORT_MODULE, driverName);
}

/**
 * Rows are plain records rather than a generic over the caller's model: an
 * exporter's job is to lay out what it was handed, and giving it the model
 * type would invite it to reach for a relation nobody serialised.
 */
export type ExportRow = Record<string, string | number | boolean | null>;

export interface ExportResult {
  filename: string;
  contentType: string;
  body: Buffer;
}

export interface ExportDriver {
  /** The extension this driver appends, without the dot: `csv`, `xlsx`, `pdf`. */
  readonly extension: string;
  readonly contentType: string;
  render(exportable: Exportable): Promise<Buffer>;
}

/**
 * What `hery make:export` generates. It says what to lay out -- the rows, the
 * column order, the base filename -- and never which format it ends up in, so
 * the same TaskListExport serves CSV, XLSX and PDF unchanged.
 *
 * `columns` is explicit rather than derived from the first row's keys: deriving
 * them means an export silently loses a column the day a row happens to be
 * missing it, and silently gains one the day someone adds a field.
 */
export interface Exportable {
  readonly filename: string;
  readonly columns: readonly string[];
  rows(): ExportRow[] | Promise<ExportRow[]>;
}
