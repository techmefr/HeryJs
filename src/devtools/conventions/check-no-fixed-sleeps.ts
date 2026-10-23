import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage']);
const SPEC_FILE = /\.(e2e-)?spec\.ts$/;
const FIXED_WAIT = /\bsetTimeout\s*\(|['"]node:timers\/promises['"]/;

/**
 * The directories a project's specs live in. Nothing is allowed to sleep
 * there: the framework's allowlist names its own specs, which a project does
 * not carry.
 */
export const PROJECT_SLEEP_SCOPE: FixedSleepScope = {
  roots: ['src', 'test'],
  allowed: new Map(),
};

export interface FixedSleepScope {
  roots: string[];
  allowed: ReadonlyMap<string, string>;
  allowlistFile?: string;
}

function findSpecFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : findSpecFiles(fullPath);
    }

    return SPEC_FILE.test(entry.name) ? [fullPath] : [];
  });
}

export function checkNoFixedSleeps(
  repoRoot: string,
  {
    roots,
    allowed,
    allowlistFile = '@heryjs/core/conventions',
  }: FixedSleepScope = PROJECT_SLEEP_SCOPE,
): boolean {
  const specFiles = roots
    .flatMap((root) => findSpecFiles(path.join(repoRoot, root)))
    .map((filePath) =>
      path.relative(repoRoot, filePath).split(path.sep).join('/'),
    );

  const sleeping = specFiles.filter((filePath) =>
    FIXED_WAIT.test(readFileSync(path.join(repoRoot, filePath), 'utf8')),
  );
  const violations = sleeping.filter((filePath) => !allowed.has(filePath));
  const staleAllowances = [...allowed.keys()].filter(
    (filePath) => !sleeping.includes(filePath),
  );

  if (violations.length > 0) {
    console.error(
      'Specs must not wait a fixed delay — wait on the condition with waitFor (#devtools/testing/wait-for), a fake timer or an injected clock:\n',
    );
    violations.forEach((filePath) => console.error(`  ${filePath}`));
  }

  if (staleAllowances.length > 0) {
    console.error(
      `These specs no longer sleep; remove them from the allowlist in ${allowlistFile}:\n`,
    );
    staleAllowances.forEach((filePath) => console.error(`  ${filePath}`));
  }

  if (violations.length > 0 || staleAllowances.length > 0) {
    return false;
  }

  console.log(
    `✔ no spec waits a fixed delay (${specFiles.length} specs checked, ${allowed.size} allowed)`,
  );

  return true;
}
