import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { prismaSchemaFiles } from '@heryjs/core/technical/prisma/schema-files';
import { modelSetMarker } from './legacy-registries';

// The comment lines directly above a model belong to it: leaving them behind
// gives a scaffolded schema a paragraph about a pivot table that is no longer
// there.
const MODEL_BLOCK = /(?:^\/\/[^\n]*\n)*^model\s+(\w+)\s*\{[\s\S]*?^\}\n?/gm;

function referencesRemoved(fieldLine: string, removed: Set<string>): boolean {
  const parts = fieldLine.trim().split(/\s+/);
  const type = parts[1]?.replace(/[[\]?]/g, '');

  return type !== undefined && removed.has(type);
}

/**
 * Removes the demo's models from a schema, and every field left pointing at
 * them: a back-relation (`blogPosts BlogPost[]` on User) referring to a model
 * that no longer exists makes the whole schema invalid, so dropping the blocks
 * alone would hand a scaffolded project a schema Prisma refuses to read.
 *
 * A pivot table is only recognised by its name -- it has no blueprint -- so the
 * caller passes the blueprint names and this expands to anything prefixed by
 * one of them.
 */
export function stripModelsFromSchema(
  schemaSource: string,
  blueprintNames: Set<string>,
): { schema: string; removed: string[] } {
  const declared = [...schemaSource.matchAll(/^model\s+(\w+)/gm)].map(
    (match) => match[1]!,
  );
  const removed = new Set(
    declared.filter((name) =>
      [...blueprintNames].some(
        (blueprint) => name === blueprint || name.startsWith(blueprint),
      ),
    ),
  );

  return {
    schema: withoutModels(schemaSource, removed),
    removed: [...removed],
  };
}

function withoutModels(schemaSource: string, removed: Set<string>): string {
  const withoutBlocks = schemaSource.replace(MODEL_BLOCK, (block, name) =>
    removed.has(String(name)) ? '' : block,
  );

  const withoutDanglingFields = withoutBlocks
    .split('\n')
    .filter((line) => !referencesRemoved(line, removed))
    .join('\n');

  // Blocks leave a run of blank lines behind them; collapsing it keeps the
  // scaffolded schema looking written rather than edited.
  return withoutDanglingFields.replace(/\n{3,}/g, '\n\n');
}

/**
 * stripModelsFromSchema over every file of the schema folder: a model goes
 * from the file declaring it, its back-relations from whichever file holds the
 * other end, and a file left with no block at all goes with them.
 */
export function stripModelsFromSchemaFolder(
  root: string,
  blueprintNames: Set<string>,
): string[] {
  const files = prismaSchemaFiles(root);
  const { removed } = stripModelsFromSchema(
    files.map((file) => readFileSync(file, 'utf8')).join('\n'),
    blueprintNames,
  );
  for (const file of files) {
    const schema = withoutModels(readFileSync(file, 'utf8'), new Set(removed));

    if (/^(model|enum|type|view|generator|datasource)\s/m.test(schema)) {
      writeFileSync(file, schema);
    } else {
      rmSync(file);
    }
  }

  return removed;
}

export function withoutSetEntries(
  source: string,
  setName: string,
  names: Set<string>,
): string {
  const marker = modelSetMarker(setName);
  const start = source.indexOf(marker);

  if (start === -1) {
    return source;
  }

  const end = source.indexOf(']', start);
  const removedEntry = (entry: string) =>
    names.has(entry) || names.has(entry.split('.')[0]!);

  // Written one entry per line, a registry carries comments between entries
  // (an apostrophe in one used to read as the start of a name) and patches
  // anchored on its layout: only the lines of removed entries go.
  if (source.slice(start, end).includes('\n')) {
    const body = source
      .slice(start + marker.length, end)
      .split('\n')
      .filter((line) => {
        const entry = /^\s*'([^']+)',?\s*$/.exec(line)?.[1];

        return entry === undefined || !removedEntry(entry);
      })
      .join('\n');
    const remaining = /^\s*'[^']+',?\s*$/m.test(body) ? body : '';

    return `${source.slice(0, start)}${marker}${remaining}${source.slice(end)}`;
  }

  const kept = [
    ...source.slice(start + marker.length, end).matchAll(/'([^']+)'/g),
  ]
    .map((entry) => entry[1]!)
    .filter((entry) => !removedEntry(entry));

  return `${source.slice(0, start)}${marker}${kept
    .map((entry) => `'${entry}'`)
    .join(', ')}${source.slice(end)}`;
}
