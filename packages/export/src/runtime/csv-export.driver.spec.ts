import type { Exportable } from '#kernel/export/export-driver';
import { CsvExportDriver } from './csv-export.driver';

const driver = new CsvExportDriver();

function exportable(
  columns: string[],
  rows: Record<string, string | number | boolean | null>[],
): Exportable {
  return { filename: 'tasks', columns, rows: () => rows };
}

async function render(
  columns: string[],
  rows: Record<string, string | number | boolean | null>[],
): Promise<string> {
  return (await driver.render(exportable(columns, rows))).toString('utf8');
}

describe('CsvExportDriver', () => {
  it('writes the declared columns as the header, in the declared order', async () => {
    const csv = await render(['id', 'title'], []);

    expect(csv).toBe('"id","title"\r\n');
  });

  /**
   * The columns are what the exportable declared, not what the first row
   * happens to hold: deriving them from the data loses a column the day a row
   * omits it, and gains one the day someone adds a field nobody meant to
   * publish.
   */
  it('follows the declared columns rather than the keys a row carries', async () => {
    const csv = await render(
      ['id', 'title'],
      [{ title: 'Ship it', id: '1', secret: 'not asked for' }],
    );

    expect(csv).toBe('"id","title"\r\n"1","Ship it"\r\n');
  });

  it('doubles a quote so a quoted value cannot end the field early', async () => {
    const csv = await render(['title'], [{ title: 'He said "go"' }]);

    expect(csv).toBe('"title"\r\n"He said ""go"""\r\n');
  });

  it('keeps a separator and a newline inside one field', async () => {
    const csv = await render(['title'], [{ title: 'a,b\nc' }]);

    expect(csv).toBe('"title"\r\n"a,b\nc"\r\n');
  });

  // Both render empty rather than as the words "null"/"undefined", which are
  // indistinguishable from real data once they sit in a spreadsheet cell.
  it('renders a null and a missing column as empty', async () => {
    const csv = await render(['a', 'b'], [{ a: null }]);

    expect(csv).toBe('"a","b"\r\n"",""\r\n');
  });

  it('ends the last line so two exports cannot concatenate into one row', async () => {
    const csv = await render(['id'], [{ id: '1' }]);

    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('declares the extension and content type the download needs', () => {
    expect(driver.extension).toBe('csv');
    expect(driver.contentType).toContain('text/csv');
  });
});
