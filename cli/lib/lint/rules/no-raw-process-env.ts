import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { walkFiles } from '../walk';
import type { LintRule, Violation } from '../types';

// Only the application's own runtime is in scope. cli/ and scripts/ are the
// generator's own tooling, not the shape a generated project's code follows,
// and a fair amount of it legitimately bootstraps from process.env before
// env.ts's schema can even be loaded.
const ROOT = 'src';

// The one file allowed to touch process.env directly -- every other read is
// supposed to go through the parsed, validated `env` export instead.
const ALLOWED_FILE = 'src/technical/config/env.ts';

const PATTERN = /process\.env\b/;

function checkFile(filePath: string, repoRoot: string): Violation[] {
  const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');

  if (relative === ALLOWED_FILE) {
    return [];
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  lines.forEach((text, index) => {
    if (PATTERN.test(text)) {
      violations.push({
        rule: 'no-raw-process-env',
        severity: 'major',
        file: relative,
        line: index + 1,
        message: `${relative}:${index + 1} — reads process.env directly instead of the validated env export`,
      });
    }
  });

  return violations;
}

export const noRawProcessEnvRule: LintRule = {
  name: 'no-raw-process-env',
  run(repoRoot) {
    const dir = path.join(repoRoot, ROOT);

    if (!existsSync(dir)) {
      return [];
    }

    return walkFiles(
      dir,
      (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'),
    ).flatMap((file) => checkFile(file, repoRoot));
  },
};
