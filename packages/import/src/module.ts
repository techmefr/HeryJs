import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'import',
  description:
    'Turn an uploaded file back into records: one contract, a CSV driver with no dependencies, a per-row report of what was rejected, and a queued path that notifies when a large import is done.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "ImportModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { import: { default: 'csv', drivers: { csv: { driver: 'csv' } } } }",
      'Write an importable: a class implementing Importable from "#technical/import/import-driver"',
      'Inject "ImportService" and call ".from(\'csv\').read(file.buffer, new TaskListImport())"',
      'Write a driver and bind importDriverToken("<name>") to accept another format alongside csv',
    ]);
  },
} satisfies ModuleDefinition;
