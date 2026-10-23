import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCANNED_ROOTS = ['src', 'cli', 'packages', 'examples', 'test'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage']);
const SPEC_FILE = /\.(e2e-)?spec\.ts$/;
const FIXED_WAIT = /\bsetTimeout\s*\(|['"]node:timers\/promises['"]/;

// A spec waits on what it expects to observe, through waitFor, a fake timer or
// an injected clock. Each entry is a spec still carrying its own hand-rolled
// sleep, with the reason it has not moved yet; nothing new belongs here.
const ALLOWED = new Map([
  [
    'src/technical/privacy/privacy-history.http.spec.ts',
    'polls with its own loop; the privacy specs are being reworked by a concurrent change and move to waitFor once it lands',
  ],
  [
    'src/devtools/testing/privacy-coverage.http.spec.ts',
    'polls with its own loop; the privacy specs are being reworked by a concurrent change and move to waitFor once it lands',
  ],
]);

function findSpecFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : findSpecFiles(fullPath);
    }

    return SPEC_FILE.test(entry.name) ? [fullPath] : [];
  });
}

export function checkNoFixedSleeps(): boolean {
  const specFiles = SCANNED_ROOTS.flatMap((root) =>
    findSpecFiles(path.join(REPO_ROOT, root)),
  ).map((filePath) =>
    path.relative(REPO_ROOT, filePath).split(path.sep).join('/'),
  );

  const sleeping = specFiles.filter((filePath) =>
    FIXED_WAIT.test(readFileSync(path.join(REPO_ROOT, filePath), 'utf8')),
  );
  const violations = sleeping.filter((filePath) => !ALLOWED.has(filePath));
  const staleAllowances = [...ALLOWED.keys()].filter(
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
      'These specs no longer sleep; remove them from the allowlist in scripts/check-no-fixed-sleeps.ts:\n',
    );
    staleAllowances.forEach((filePath) => console.error(`  ${filePath}`));
  }

  if (violations.length > 0 || staleAllowances.length > 0) {
    return false;
  }

  console.log(
    `✔ no spec waits a fixed delay (${specFiles.length} specs checked, ${ALLOWED.size} allowed)`,
  );

  return true;
}
