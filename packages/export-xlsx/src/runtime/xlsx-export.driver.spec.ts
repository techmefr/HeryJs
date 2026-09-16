import ExcelJS from 'exceljs';
import type { Exportable } from '#kernel/export/export-driver';
import { XlsxExportDriver } from './xlsx-export.driver';

const driver = new XlsxExportDriver();

type LoadableBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const exportable: Exportable = {
  filename: 'tasks',
  columns: ['id', 'title', 'done'],
  rows: () => [
    { id: '1', title: 'Ship it', done: true },
    { id: '2', title: null, done: false },
  ],
};

async function sheetOf(source: Exportable): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  const rendered = await driver.render(source);

  // exceljs types `load` against the Buffer of an older @types/node, so the
  // current generic Buffer is not assignable to it. Casting to the parameter's
  // own type keeps the mismatch at this one call instead of weakening render().
  await workbook.xlsx.load(rendered as unknown as LoadableBuffer);

  const [sheet] = workbook.worksheets;

  if (!sheet) {
    throw new Error('The rendered workbook carries no worksheet');
  }

  return sheet;
}

describe('XlsxExportDriver', () => {
  it('declares the extension and content type a spreadsheet needs', () => {
    expect(driver.extension).toBe('xlsx');
    expect(driver.contentType).toContain('spreadsheetml');
  });

  /**
   * Reading the bytes back through exceljs rather than asserting on their
   * length: a workbook that is merely non-empty can still be one no
   * spreadsheet will open, which is the failure worth catching here.
   */
  it('produces a workbook that reads back with a header and one row per record', async () => {
    const sheet = await sheetOf(exportable);

    expect(sheet.getRow(1).values).toEqual([undefined, 'id', 'title', 'done']);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(2).getCell(2).value).toBe('Ship it');
  });

  // null, not '': exceljs writes an empty string as a cell that contains
  // something, and a spreadsheet treats that differently from a blank one.
  it('leaves a null cell genuinely blank', async () => {
    const sheet = await sheetOf(exportable);

    expect(sheet.getRow(3).getCell(2).value).toBeNull();
  });

  it('writes a real Buffer, not an ArrayBuffer the HTTP layer would serialise', async () => {
    expect(Buffer.isBuffer(await driver.render(exportable))).toBe(true);
  });
});
