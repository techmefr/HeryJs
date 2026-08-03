import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { walkFiles } from '../walk';
import type { LintRule, Violation } from '../types';

const ROOTS = ['src', 'examples'];

function checkFile(filePath: string, repoRoot: string): Violation[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  const violations: Violation[] = [];
  const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');

  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      violations.push({
        rule: 'no-any',
        severity: 'major',
        file: relative,
        line: line + 1,
        message: `${relative}:${line + 1} — "any" widens the type checker's job back onto a human`,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return violations;
}

export const noAnyRule: LintRule = {
  name: 'no-any',
  run(repoRoot) {
    return ROOTS.flatMap((root) => {
      const dir = path.join(repoRoot, root);
      return existsSync(dir)
        ? walkFiles(
            dir,
            (name) =>
              name.endsWith('.ts') &&
              !name.endsWith('.spec.ts') &&
              !name.endsWith('.d.ts'),
          )
        : [];
    }).flatMap((file) => checkFile(file, repoRoot));
  },
};
