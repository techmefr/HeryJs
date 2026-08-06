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

  const withoutBlocks = schemaSource.replace(MODEL_BLOCK, (block, name) =>
    removed.has(String(name)) ? '' : block,
  );

  const withoutDanglingFields = withoutBlocks
    .split('\n')
    .filter((line) => !referencesRemoved(line, removed))
    .join('\n');

  return {
    // Blocks leave a run of blank lines behind them; collapsing it keeps the
    // scaffolded schema looking written rather than edited.
    schema: withoutDanglingFields.replace(/\n{3,}/g, '\n\n'),
    removed: [...removed],
  };
}

export function withoutSetEntries(
  source: string,
  setName: string,
  names: Set<string>,
): string {
  const marker = `const ${setName} = new Set([`;
  const start = source.indexOf(marker);

  if (start === -1) {
    return source;
  }

  const end = source.indexOf(']', start);
  const kept = [
    ...source.slice(start + marker.length, end).matchAll(/'([^']+)'/g),
  ]
    .map((entry) => entry[1]!)
    .filter((entry) => !names.has(entry));

  return `${source.slice(0, start)}${marker}${kept
    .map((entry) => `'${entry}'`)
    .join(', ')}${source.slice(end)}`;
}
