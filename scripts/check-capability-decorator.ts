import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const MUTATING_HTTP_DECORATORS = new Set(['Post', 'Patch', 'Put', 'Delete']);

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
      const decorators = ts.getDecorators?.(node) ?? [];
      const names = decorators
        .map(decoratorName)
        .filter((name): name is string => name !== undefined);

      const hasMutatingRoute = names.some((name) =>
        MUTATING_HTTP_DECORATORS.has(name),
      );
      const hasCapability = names.includes('Capability');

      if (hasMutatingRoute && !hasCapability) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        const methodName = node.name.getText();
        violations.push(
          `${filePath}:${line + 1} — "${methodName}" has a mutating route decorator but no @Capability(...)`,
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return violations;
}

const functionalDir = path.resolve(__dirname, '..', 'src', 'functional');
const controllerFiles = findControllerFiles(functionalDir);
const violations = controllerFiles.flatMap(checkFile);

if (violations.length > 0) {
  console.error('Missing @Capability(...) on mutating routes:\n');
  violations.forEach((violation) => console.error(`  ${violation}`));
  process.exit(1);
}

console.log(
  `✔ every mutating route carries @Capability(...) (${controllerFiles.length} controllers checked)`,
);
