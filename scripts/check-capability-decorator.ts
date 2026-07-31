import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Patch', 'Put', 'Delete']);

// Resources live in src/functional in a real project, and the repo's own example
// lives in examples/. Both are scanned so the example cannot drift out of the
// conventions it is supposed to demonstrate.
const RESOURCE_ROOTS = ['src/functional', 'examples'];

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
      return findControllerFiles(fullPath);
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

      if (hasRoute && !names.includes('Capability')) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        violations.push(
          `${filePath}:${line + 1} — "${node.name.getText()}" is a route but carries no @Capability(...)`,
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
    console.error('Routes without @Capability(...):\n');
    violations.forEach((violation) => console.error(`  ${violation}`));
    console.error(
      '\nCapabilitiesGuard lets a route through when the metadata is absent, so an\nundecorated read hands out every row the query returns.',
    );
    return false;
  }

  console.log(
    `✔ every route carries @Capability(...) (${controllerFiles.length} controllers checked)`,
  );

  return true;
}
