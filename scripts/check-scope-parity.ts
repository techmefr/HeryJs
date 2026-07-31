import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const SCOPE_HELPER = 'scopeWhereFor';

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

function findServiceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return findServiceFiles(fullPath);
    }

    return entry.name.endsWith('.service.ts') ? [fullPath] : [];
  });
}

function callsScopeHelper(method: ts.MethodDeclaration): boolean {
  let found = false;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === SCOPE_HELPER
    ) {
      found = true;
    }

    ts.forEachChild(node, visit);
  };

  visit(method);

  return found;
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
    if (
      ts.isMethodDeclaration(node) &&
      node.name.getText() === 'search' &&
      !callsScopeHelper(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      violations.push(
        `${filePath}:${line + 1} — "search" never calls ${SCOPE_HELPER}(...)`,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return violations;
}

export function checkScopeParity(): boolean {
  const serviceFiles = resourceFilesIn(findServiceFiles);

  if (serviceFiles.length === 0) {
    // This repository always ships examples/, so an empty scan here means
    // something got silently emptied. A project scaffolded by `hery new` never
    // has examples/ at all and starts with zero resources on purpose — that is
    // not the regression this check exists to catch.
    if (existsSync(path.resolve(__dirname, '..', 'examples'))) {
      console.error(
        `Found no resource service under ${RESOURCE_ROOTS.join(' or ')}. This check reports
success on an empty scan, so an empty scan has to be the failure instead.`,
      );
      return false;
    }

    console.log(
      '✔ no resource service yet (no examples/ directory — this is a scaffolded project, not the framework repo)',
    );
    return true;
  }

  const violations = serviceFiles.flatMap(checkFile);

  if (violations.length > 0) {
    console.error(
      `Collection queries not scoped through ${SCOPE_HELPER}(...):\n`,
    );
    violations.forEach((violation) => console.error(`  ${violation}`));
    console.error(
      '\nThe detail route resolves a permission preset against a loaded record; the\ncollection query has to narrow the rows with that same preset. Written apart,\nthe two drift and the list hands out what the detail route refuses.',
    );
    return false;
  }

  console.log(
    `✔ every collection query derives its scope from a preset (${serviceFiles.length} services checked)`,
  );

  return true;
}
