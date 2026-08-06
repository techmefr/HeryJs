import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { blueprintSchema } from '../cli/lib/blueprint';
import type { Blueprint } from '../cli/lib/blueprint';
import { buildResourceContext } from '../cli/lib/resource-context';
import type { ResourceContext } from '../cli/lib/resource-context';
import * as templates from '../cli/lib/templates';

const root = path.resolve(__dirname, '..');

const IMPORT_BLOCK = /^import[\s\S]*?from '[^']+';$/gm;
const BOUND_NAMES = /\{([^}]*)\}|import\s+(?:type\s+)?(\w+)\s+from/;

/**
 * The generator emits source as text, so nothing type-checks what it produces.
 * A template that calls a framework function it forgot to import, or imports one
 * it no longer calls, ships broken code to every project generated after it.
 * Both directions of that mistake have already happened, so both are checked.
 */
function frameworkExports(): Set<string> {
  const names = new Set<string>();
  const pattern =
    /^export (?:async function|function|const|class|interface|type|enum) (\w+)/gm;

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        for (const match of readFileSync(fullPath, 'utf8').matchAll(pattern)) {
          if (match[1] !== undefined) {
            names.add(match[1]);
          }
        }
      }
    }
  };

  for (const layer of ['technical', 'modules', 'devtools']) {
    walk(path.join(root, 'src', layer));
  }

  return names;
}

function boundNames(importBlock: string): string[] {
  const braces = BOUND_NAMES.exec(importBlock);
  const inside = braces?.[1];

  if (inside === undefined) {
    return braces?.[2] === undefined ? [] : [braces[2]];
  }

  return inside
    .split(',')
    .map(
      (part) =>
        part
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim() ?? '',
    )
    .filter((name) => name.length > 0 && name !== 'type');
}

function contextFor(preset: 'own' | 'team'): ResourceContext {
  return buildResourceContext(
    // No includes/aggregates are declared, so the empty arrays zod defaults
    // to already satisfy Blueprint's resolved shape -- there is nothing here
    // that needed a referenced blueprint to resolve against.
    blueprintSchema.parse({
      name: 'ImportProbe',
      fields: [
        { name: 'label', type: 'string' },
        { name: 'count', type: 'int', optional: true },
      ],
      permissions: {
        view: preset,
        create: preset,
        update: preset,
        delete: preset,
      },
      sorts: ['createdAt'],
      filters: ['label'],
    }) as unknown as Blueprint,
  );
}

const EMITTERS = [
  'dtoFile',
  'presetsFile',
  'policyFile',
  'recordLoaderFile',
  'serviceFile',
  'controllerFile',
  'moduleFile',
  'resolverFile',
  'mcpToolsFile',
  'streamControllerFile',
  'liveGatewayFile',
  'specFile',
  'viewFile',
  'factoryFile',
] as const;

export function checkTemplateImports(): boolean {
  const known = frameworkExports();
  const problems: string[] = [];

  for (const preset of ['own', 'team'] as const) {
    const ctx = contextFor(preset);

    for (const name of EMITTERS) {
      const emit = templates[name];
      const emitted = emit(ctx);
      const blocks = emitted.match(IMPORT_BLOCK) ?? [];
      const body = emitted.replace(IMPORT_BLOCK, '');
      const imported = blocks.flatMap(boundNames);

      for (const bound of imported) {
        if (!new RegExp(`\\b${bound}\\b`).test(body)) {
          problems.push(
            `${name} (${preset}) imports ${bound} but never uses it`,
          );
        }
      }

      for (const symbol of known) {
        if (imported.includes(symbol)) {
          continue;
        }

        if (new RegExp(`\\b${symbol}\\s*\\(`).test(body)) {
          problems.push(
            `${name} (${preset}) calls ${symbol} without importing it`,
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    console.error(
      'The generator emits source as text, so these would only surface in a project generated from it:\n',
    );
    problems.forEach((problem) => console.error(`  ${problem}`));
    return false;
  }

  console.log(
    `✔ every template imports exactly what it uses (${EMITTERS.length} templates, 2 presets)`,
  );

  return true;
}
