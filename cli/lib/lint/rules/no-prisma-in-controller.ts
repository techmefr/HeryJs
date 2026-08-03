import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { walkFiles } from '../walk';
import type { LintRule, Violation } from '../types';

// Scoped to generated resources, not the whole src/ tree: this is the
// convention `hery generate` writes (controller -> service -> Prisma), not a
// kernel-wide ban. technical/ controllers like the health check legitimately
// reach the tenant-scoped client directly, since they have no service layer
// to delegate to and nothing to leak a security decision into.
const ROOTS = ['src/functional', 'examples'];

// A type-only import of a Prisma model (`import type { Workout } from
// '@prisma/client'`) is not a leak -- it names a shape, the same way the view
// and the service already do, and carries no query capability with it. Only
// a value import of the client or its runtime namespace does.
const BANNED_VALUE_IMPORTS = new Set([
  'PrismaClient',
  'Prisma',
  'PRISMA_CLIENT',
]);

function checkFile(filePath: string, repoRoot: string): Violation[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
  const violations: Violation[] = [];

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.isTypeOnly
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }

    for (const element of bindings.elements) {
      if (element.isTypeOnly || !BANNED_VALUE_IMPORTS.has(element.name.text)) {
        continue;
      }

      const { line } = source.getLineAndCharacterOfPosition(element.getStart());
      violations.push({
        rule: 'no-prisma-in-controller',
        severity: 'critical',
        file: relative,
        line: line + 1,
        message: `${relative}:${line + 1} — imports "${element.name.text}" directly, bypassing the service that is supposed to own the query`,
      });
    }
  }

  return violations;
}

export const noPrismaInControllerRule: LintRule = {
  name: 'no-prisma-in-controller',
  run(repoRoot) {
    return ROOTS.flatMap((root) => {
      const dir = path.join(repoRoot, root);
      return existsSync(dir)
        ? walkFiles(dir, (name) => name.endsWith('.controller.ts'))
        : [];
    }).flatMap((file) => checkFile(file, repoRoot));
  },
};
