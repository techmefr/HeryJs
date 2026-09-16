import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type {
  ExportDriver,
  Exportable,
  ExportRow,
} from '#kernel/export/export-driver';

const PAGE_MARGIN = 40;
const ROW_HEIGHT = 18;
const FONT_SIZE = 9;
const COLUMN_GUTTER = 6;

@Injectable()
export class PdfExportDriver implements ExportDriver {
  readonly extension = 'pdf';
  readonly contentType = 'application/pdf';

  async render(exportable: Exportable): Promise<Buffer> {
    const rows = await exportable.rows();
    const document = new PDFDocument({
      margin: PAGE_MARGIN,
      layout: 'landscape',
    });
    const collected = collect(document);

    document.fontSize(FONT_SIZE);

    const columnWidth = this.columnWidth(document, exportable.columns.length);
    const bottom = document.page.height - PAGE_MARGIN - ROW_HEIGHT;
    let y = PAGE_MARGIN;

    this.writeRow(document, [...exportable.columns], columnWidth, y, true);
    y += ROW_HEIGHT;

    for (const row of rows) {
      // The header is redrawn on every page rather than only the first: a
      // table whose columns are named once is unreadable from page two on.
      if (y > bottom) {
        document.addPage();
        y = PAGE_MARGIN;
        this.writeRow(document, [...exportable.columns], columnWidth, y, true);
        y += ROW_HEIGHT;
      }

      const values = exportable.columns.map((column) => cell(row[column]));
      this.writeRow(document, values, columnWidth, y, false);
      y += ROW_HEIGHT;
    }

    document.end();

    return collected;
  }

  private columnWidth(document: PDFKit.PDFDocument, columns: number): number {
    const usable = document.page.width - PAGE_MARGIN * 2;

    // A zero-column exportable would divide by zero and place every cell at
    // Infinity, which pdfkit writes out as a blank page with no error.
    return columns === 0 ? usable : usable / columns;
  }

  private writeRow(
    document: PDFKit.PDFDocument,
    values: string[],
    columnWidth: number,
    y: number,
    isHeader: boolean,
  ): void {
    document.font(isHeader ? 'Helvetica-Bold' : 'Helvetica');

    values.forEach((value, index) => {
      document.text(value, PAGE_MARGIN + index * columnWidth, y, {
        width: columnWidth - COLUMN_GUTTER,
        height: ROW_HEIGHT,
        ellipsis: true,
        lineBreak: false,
      });
    });
  }
}

/**
 * pdfkit writes through a stream and never hands back a finished document, so
 * the chunks are gathered here and resolved on 'end'. Subscribing before any
 * content is written matters: a listener attached after document.end() misses
 * every chunk and resolves an empty file.
 */
function collect(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
}

function cell(value: ExportRow[string] | undefined): string {
  // A missing column and an explicit null both render as empty rather than as
  // "undefined"/"null": those two words read as real content in a table.
  return value === undefined || value === null ? '' : String(value);
}
