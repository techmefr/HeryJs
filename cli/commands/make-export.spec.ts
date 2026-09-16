import { buildExportable } from './make-export';

describe('the exportable make:export writes', () => {
  it('names the class after what the developer typed', () => {
    const exportable = buildExportable('TaskListExport');

    expect(exportable.fileName).toBe('task-list-export.ts');
    expect(exportable.source).toContain(
      'export class TaskListExport implements Exportable',
    );
  });

  it('defaults the domain to the name without its Export suffix', () => {
    expect(buildExportable('TaskListExport').domain).toBe('task-list');
    expect(buildExportable('InvoiceExport').domain).toBe('invoice');
  });

  it('takes an explicit domain over the derived one', () => {
    expect(buildExportable('TaskListExport', 'Billing').domain).toBe('billing');
  });

  it('imports the contract from the kernel', () => {
    expect(buildExportable('TaskListExport').source).toContain(
      "from '#technical/export/export-driver'",
    );
  });

  /**
   * The three members are the whole contract, and columns being declared
   * rather than derived from the first row is what stops an export silently
   * losing a column -- so the template states them all.
   */
  it('declares the filename, the columns and the rows', () => {
    const source = buildExportable('TaskListExport').source;

    expect(source).toContain("readonly filename = 'task-list-export'");
    expect(source).toContain('readonly columns: readonly string[]');
    expect(source).toContain('rows(): ExportRow[]');
  });

  it('says nothing about the format it ends up in', () => {
    const source = buildExportable('TaskListExport').source;

    expect(source).not.toMatch(/csv|xlsx|pdf/i);
    expect(source).not.toContain('Driver');
  });
});
