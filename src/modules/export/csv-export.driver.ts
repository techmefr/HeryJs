import { Injectable } from '@nestjs/common';
import type {
  ExportDriver,
  Exportable,
  ExportRow,
} from '#technical/export/export-driver';

/**
 * Export's zero-config default, and the counterpart of mail's log driver: a
 * real driver that needs no dependency, no container and no credentials, so a
 * freshly generated app can export something the day it boots.
 *
 * RFC 4180 quoting, applied to every field rather than only the ones that look
 * like they need it. Deciding per field means deciding what a separator is,
 * and a project exporting French data through a semicolon-separated locale
 * discovers that decision the hard way.
 */
@Injectable()
export class CsvExportDriver implements ExportDriver {
  readonly extension = 'csv';
  readonly contentType = 'text/csv; charset=utf-8';

  async render(exportable: Exportable): Promise<Buffer> {
    const rows = await exportable.rows();
    const lines = [
      exportable.columns.map(quote).join(','),
      ...rows.map((row) => this.line(row, exportable.columns)),
    ];

    // A trailing newline, because a file whose last line has none is the one
    // that concatenates into the next file's header when anyone cats two
    // exports together.
    return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
  }

  private line(row: ExportRow, columns: readonly string[]): string {
    return columns.map((column) => quote(cell(row[column]))).join(',');
  }
}

function cell(value: ExportRow[string] | undefined): string {
  // A missing column and an explicit null both render as empty rather than as
  // "undefined"/"null": those two words are indistinguishable from real data
  // once they are sitting in a spreadsheet cell.
  return value === undefined || value === null ? '' : String(value);
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
