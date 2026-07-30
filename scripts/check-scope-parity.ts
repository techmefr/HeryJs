import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const SCOPE_HELPER = 'scopeWhereFor';

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
  const functionalDir = path.resolve(__dirname, '..', 'src', 'functional');
  const serviceFiles = findServiceFiles(functionalDir);
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
