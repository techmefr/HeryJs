import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Patch', 'Put', 'Delete']);

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
  const functionalDir = path.resolve(__dirname, '..', 'src', 'functional');
  const controllerFiles = findControllerFiles(functionalDir);
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
