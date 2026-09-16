import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'export-xlsx',
  description:
    'Export to a real spreadsheet through exceljs, as an export driver',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/modules/export',
  dependencies: ['exceljs'],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "XlsxExportModule" into src/app.module.ts',
      "Declare it in hery.config.ts under export.drivers, e.g. xlsx: { driver: 'xlsx' }",
      'Call ".as(\'xlsx\').generate(new TaskListExport(tasks))" on ExportService',
    ]);
  },
} satisfies ModuleDefinition;
