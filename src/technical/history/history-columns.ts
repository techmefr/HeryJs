import { Prisma } from '@prisma/client';

const HISTORY_COLUMNS = new Set<string>([
  'Snippet.title',
  'Snippet.summary',
  'Snippet.status',
  'Snippet.deletedAt',
  'Snippet.version',
]);
const COLUMN_SEPARATOR = '.';

let registry: Map<string, string[]> | null = null;

function buildRegistry(): Map<string, string[]> {
  const columns = new Map<string, string[]>();

  for (const model of Prisma.dmmf.datamodel.models) {
    const tracked = model.fields
      .filter(
        (field) =>
          field.kind === 'scalar' &&
          HISTORY_COLUMNS.has(`${model.name}${COLUMN_SEPARATOR}${field.name}`),
      )
      .map((field) => field.name);

    if (tracked.length > 0) {
      columns.set(model.name, tracked);
    }
  }

  return columns;
}

/**
 * The columns a history snapshot of this model keeps, or null when the model
 * keeps no history. The generator registers a column here only when the
 * blueprint field is neither `hidden` nor `encrypted`, so the answer is also
 * the list of what a history route is allowed to show: a column absent from it
 * is not stored in a snapshot at all, rather than stored and filtered later.
 */
export function historyColumnsOf(model: string): readonly string[] | null {
  registry ??= buildRegistry();

  return registry.get(model) ?? null;
}
