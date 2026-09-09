import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROUTE_DECORATORS = new Set([
  'Get',
  'Post',
  'Patch',
  'Put',
  'Delete',
  'All',
]);

// RateLimitGuard runs globally and falls back to the "read" bucket for a route
// carrying neither decorator, so an undeclared route is never left
// unprotected -- this check is about a route saying which bucket it wants
// instead of inheriting one by accident, not about closing a hole the guard
// already closes. Scoped to the kernel and its modules, the way pagination is:
// a generated resource's controller is a blueprint decision, not this check's.
const ROOTS = ['src/technical', 'src/devtools', 'src/modules', 'packages'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);

function resourceFilesIn(collect: (dir: string) => string[]): string[] {
  const repoRoot = path.resolve(__dirname, '..');

  return ROOTS.flatMap((relative) => {
    const dir = path.join(repoRoot, relative);

    return existsSync(dir) ? collect(dir) : [];
  });
}

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name)
        ? []
        : findControllerFiles(fullPath);
    }

    return entry.name.endsWith('.controller.ts') ? [fullPath] : [];
  });
}

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expr = decorator.expression;
  const callee = ts.isCallExpression(expr) ? expr.expression : expr;
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

function checkFile(filePath: string): string[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  const violations: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node)) {
      const names = (ts.getDecorators?.(node) ?? [])
        .map(decoratorName)
        .filter((name): name is string => name !== undefined);

      const hasRoute = names.some((name) => ROUTE_DECORATORS.has(name));

      const isDecided =
        names.includes('RateLimit') || names.includes('UnthrottledRoute');

      if (hasRoute && !isDecided) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        violations.push(
          `${filePath}:${line + 1} — "${node.name.getText()}" is a route but carries neither @RateLimit('<bucket>') nor @UnthrottledRoute('<reason>')`,
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return violations;
}

export function checkRateLimitDecorator(): boolean {
  const controllerFiles = resourceFilesIn(findControllerFiles);

  if (controllerFiles.length === 0) {
    console.log('✔ no kernel or module controller found to check');
    return true;
  }

  const violations = controllerFiles.flatMap(checkFile);

  if (violations.length > 0) {
    console.error('Routes with no rate-limit decision:\n');
    violations.forEach((violation) => console.error(`  ${violation}`));
    console.error(
      '\nThe guard still protects an undecorated route with the "read" bucket, but\nthat is a fallback for code this repository does not own -- its own routes\nsay which bucket they want, or declare @UnthrottledRoute(\'<reason>\') for one\nthat genuinely takes none (a webhook signed by its sender, a health check).',
    );
    return false;
  }

  console.log(
    `✔ every kernel and module route carries @RateLimit(...) or @UnthrottledRoute(...) (${controllerFiles.length} controllers checked)`,
  );

  return true;
}
