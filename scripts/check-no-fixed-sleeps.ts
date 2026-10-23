import * as path from 'node:path';
import { checkNoFixedSleeps as checkSpecs } from '@heryjs/core/conventions';

const REPO_ROOT = path.resolve(__dirname, '..');

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

export function checkNoFixedSleeps(): boolean {
  return checkSpecs(REPO_ROOT, {
    roots: ['src', 'cli', 'packages', 'examples', 'test'],
    allowed: ALLOWED,
    allowlistFile: 'scripts/check-no-fixed-sleeps.ts',
  });
}
