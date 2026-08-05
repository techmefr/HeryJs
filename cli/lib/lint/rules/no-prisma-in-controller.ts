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

// A type-only import of a Prisma model (`import type { BlogPost } from
// '@prisma/client'`) is not a leak -- it names a shape, the same way the view
// and the service already do, and carries no query capability with it. Only
// a value import of the client or its runtime namespace does.
const BANNED_VALUE_IMPORTS = new Set([
  'PrismaClient',
  'Prisma',
  'PRISMA_CLIENT',
]);

// Gated on where the banned name actually comes from, not just its spelling:
// a domain that legitimately exports something of its own named `Prisma`
// would otherwise be flagged critical for no reason, and this is also what
// lets the namespace/default branches below reuse the same check instead of
// separately guessing at intent.
const BANNED_MODULE_SPECIFIERS = new Set([
  '@prisma/client',
  '#technical/prisma/prisma.client',
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

  const flag = (node: ts.Node, name: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    violations.push({
      rule: 'no-prisma-in-controller',
      severity: 'critical',
      file: relative,
      line: line + 1,
      message: `${relative}:${line + 1} — imports "${name}" directly, bypassing the service that is supposed to own the query`,
    });
  };

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !BANNED_MODULE_SPECIFIERS.has(statement.moduleSpecifier.text)
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;

    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        // The local binding, not the imported symbol: `import { PrismaClient
        // as PC }` still reaches the same client, and only the binding is
        // what the rest of the file can actually call.
        const localName = (element.propertyName ?? element.name).text;

        if (!element.isTypeOnly && BANNED_VALUE_IMPORTS.has(localName)) {
          flag(element, element.name.text);
        }
      }
      continue;
    }

    if (bindings && ts.isNamespaceImport(bindings)) {
      flag(bindings, bindings.name.text);
      continue;
    }

    if (statement.importClause?.name) {
      flag(statement.importClause.name, statement.importClause.name.text);
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
