import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'export',
  description:
    'Turn records into a file the caller can download: one contract, a CSV driver with no dependencies, and a queued path that notifies when a large export is ready.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "ExportModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { export: { default: 'csv', drivers: { csv: { driver: 'csv' } } } }",
      'Generate an exportable with "pnpm hery make:export TaskListExport"',
      'Inject "ExportService" and call ".as(\'csv\').generate(new TaskListExport(tasks))"',
      'Install "export-xlsx" or "export-pdf" to offer more formats, then declare them alongside csv',
    ]);
  },
} satisfies ModuleDefinition;
