import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type {
  ExportDriver,
  Exportable,
  ExportRow,
} from '#kernel/export/export-driver';

const SHEET_NAME = 'Export';

@Injectable()
export class XlsxExportDriver implements ExportDriver {
  readonly extension = 'xlsx';
  readonly contentType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async render(exportable: Exportable): Promise<Buffer> {
    const rows = await exportable.rows();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);

    sheet.addRow([...exportable.columns]);
    for (const row of rows) {
      sheet.addRow(exportable.columns.map((column) => cell(row[column])));
    }

    // exceljs answers with an ArrayBuffer-typed value under some of its type
    // definitions, and a Buffer that is not a Buffer reaches the HTTP layer as
    // a JSON-serialised object instead of a file.
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

function cell(value: ExportRow[string] | undefined): ExportRow[string] {
  // A missing column becomes an empty cell rather than the string
  // "undefined", which a spreadsheet cannot be told apart from real data.
  return value === undefined ? null : value;
}
