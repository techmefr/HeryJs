import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'export-pdf',
  description:
    'Export to a paginated PDF table through pdfkit, as an export driver',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/modules/export',
  dependencies: ['pdfkit'],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "PdfExportModule" into src/app.module.ts',
      "Declare it in hery.config.ts under export.drivers, e.g. pdf: { driver: 'pdf' }",
      'Call ".as(\'pdf\').generate(new TaskListExport(tasks))" on ExportService',
    ]);
  },
} satisfies ModuleDefinition;
