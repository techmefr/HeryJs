import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { publicEnvKeys } from '../../../../src/technical/config/env-schema';
import { walkFiles } from '../walk';
import type { LintRule, Violation } from '../types';

// The admin dashboard's own client bundle, and the runtime template hery
// install copies into it. Both run in the browser, where every read gets
// inlined into a bundle anyone can download -- server code goes through the
// no-raw-process-env rule instead.
const ROOTS = ['admin', 'packages/admin-astro/src/runtime'];

const PATTERN = /(?:import\.meta\.env|process\.env)\.([A-Z][A-Z0-9_]*)/g;

function checkFile(
  filePath: string,
  repoRoot: string,
  allowed: Set<string>,
): Violation[] {
  const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  lines.forEach((text, index) => {
    for (const match of text.matchAll(PATTERN)) {
      const name = match[1];

      if (name !== undefined && !allowed.has(name)) {
        violations.push({
          rule: 'no-server-env-in-client',
          severity: 'critical',
          file: relative,
          line: index + 1,
          message: `${relative}:${index + 1} — reads "${name}" on the client side, but it is not declared in the public env schema; Astro inlines it into the browser bundle`,
        });
      }
    }
  });

  return violations;
}

export const noServerEnvInClientRule: LintRule = {
  name: 'no-server-env-in-client',
  run(repoRoot) {
    const allowed = new Set(publicEnvKeys());

    return ROOTS.flatMap((root) => {
      const dir = path.join(repoRoot, root);
      return existsSync(dir)
        ? walkFiles(
            dir,
            (name) =>
              (name.endsWith('.ts') ||
                name.endsWith('.tsx') ||
                name.endsWith('.astro')) &&
              !name.endsWith('.spec.ts'),
          )
        : [];
    }).flatMap((file) => checkFile(file, repoRoot, allowed));
  },
};
