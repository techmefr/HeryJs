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

// Every route in the repository, not just the business ones: a kernel route, a
// module route and a devtools route hand out data exactly like a resource route
// does, and CapabilitiesGuard cannot tell "this route needs no capability" from
// "someone forgot the capability". @PublicRoute('<reason>') is how a route says
// the first out loud; anything else has to carry a @Capability.
const RESOURCE_ROOTS = ['src', 'examples', 'packages'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);

function resourceFilesIn(collect: (dir: string) => string[]): string[] {
  const repoRoot = path.resolve(__dirname, '..');

  return RESOURCE_ROOTS.flatMap((relative) => {
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
        names.includes('Capability') || names.includes('PublicRoute');

      if (hasRoute && !isDecided) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        violations.push(
          `${filePath}:${line + 1} — "${node.name.getText()}" is a route but carries neither @Capability(...) nor @PublicRoute('<reason>')`,
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return violations;
}

export function checkCapabilityDecorator(): boolean {
  const controllerFiles = resourceFilesIn(findControllerFiles);

  if (controllerFiles.length === 0) {
    // This repository always ships examples/, so an empty scan here means
    // something got silently emptied. A project scaffolded by `hery new` never
    // has examples/ at all and starts with zero resources on purpose — that is
    // not the regression this check exists to catch.
    if (existsSync(path.resolve(__dirname, '..', 'examples'))) {
      console.error(
        `Found no resource controller under ${RESOURCE_ROOTS.join(' or ')}. This check reports
success on an empty scan, so an empty scan has to be the failure instead.`,
      );
      return false;
    }

    console.log(
      '✔ no resource controller yet (no examples/ directory — this is a scaffolded project, not the framework repo)',
    );
    return true;
  }

  const violations = controllerFiles.flatMap(checkFile);

  if (violations.length > 0) {
    console.error('Routes with no authorization decision:\n');
    violations.forEach((violation) => console.error(`  ${violation}`));
    console.error(
      "\nCapabilitiesGuard lets a route through when the metadata is absent, so an\nundecorated read hands out every row the query returns. If the route really\ncannot carry a capability -- logging in, a signed URL, a webhook signed by its\nsender -- say so with @PublicRoute('<reason>').",
    );
    return false;
  }

  console.log(
    `✔ every route carries @Capability(...) or @PublicRoute(...) (${controllerFiles.length} controllers checked)`,
  );

  return true;
}
