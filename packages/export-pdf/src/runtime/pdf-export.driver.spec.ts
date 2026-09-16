import type { Exportable } from '#kernel/export/export-driver';
import { PdfExportDriver } from './pdf-export.driver';

const driver = new PdfExportDriver();

function exportable(rowCount: number): Exportable {
  return {
    filename: 'tasks',
    columns: ['id', 'title'],
    rows: () =>
      Array.from({ length: rowCount }, (_, index) => ({
        id: String(index + 1),
        title: `Task ${index + 1}`,
      })),
  };
}

describe('PdfExportDriver', () => {
  it('declares the extension and content type a download needs', () => {
    expect(driver.extension).toBe('pdf');
    expect(driver.contentType).toBe('application/pdf');
  });

  /**
   * pdfkit streams, so the driver has to collect chunks and resolve on 'end'.
   * Getting that wrong yields an empty or truncated buffer rather than an
   * error, so the header and the trailer are both asserted: a PDF missing
   * %%EOF is one a reader refuses to open.
   */
  it('produces a complete PDF, header and trailer included', async () => {
    const pdf = await driver.render(exportable(3));

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('%%EOF');
  });

  it('stays valid with no rows at all', async () => {
    const pdf = await driver.render(exportable(0));

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  // Enough rows to force a second page: the pagination is the one piece of
  // layout logic here, and a single-page test would never reach it.
  it('paginates a long table instead of losing the overflow', async () => {
    const short = await driver.render(exportable(5));
    const long = await driver.render(exportable(400));

    expect(long.byteLength).toBeGreaterThan(short.byteLength);
    expect(long.toString('latin1')).toContain('%%EOF');
  });

  it('survives a column the row never carries', async () => {
    const pdf = await driver.render({
      filename: 'tasks',
      columns: ['id', 'missing'],
      rows: () => [{ id: '1' }],
    });

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
