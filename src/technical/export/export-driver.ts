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
import { resolveTranslation } from '#technical/i18n/translatable';
import type { Translations } from '#technical/i18n/translatable';
import { translateMessage } from '#technical/i18n/translate';

export const EXPORT_MODULE = 'export';

export function exportDriverToken(driverName: string): symbol {
  return driverToken(EXPORT_MODULE, driverName);
}

/**
 * Rows are plain records rather than a generic over the caller's model: an
 * exporter's job is to lay out what it was handed, and giving it the model
 * type would invite it to reach for a relation nobody serialised.
 *
 * A translatable field arrives as its translations (`{ en, fr }`) and is laid
 * out in the export's locale by `exportCellText` -- written as is, it came out
 * as "[object Object]".
 */
export type ExportCell = string | number | boolean | null | Translations;

export type ExportRow = Record<string, ExportCell>;

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
 *
 * `headers` names a column for a reader, as a catalogue key or as text; a
 * column with none is headed by its own name.
 */
export interface Exportable {
  readonly filename: string;
  readonly columns: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  rows(): ExportRow[] | Promise<ExportRow[]>;
}

export function exportHeaders(exportable: Exportable): string[] {
  return exportable.columns.map((column) =>
    translateMessage(exportable.headers?.[column] ?? column),
  );
}

export function exportCellText(value: ExportCell | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'object') {
    return resolveTranslation(value) ?? '';
  }

  return String(value);
}
