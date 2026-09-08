import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { valid } from 'semver';
import { KERNEL_VERSION } from '../cli/lib/kernel-version';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * The kernel version has to be readable from inside a generated project, where
 * package.json belongs to the project and carries the project's own version --
 * so it is a constant under cli/, which `hery new` copies, and the number then
 * exists twice. Every module's compatibility range is checked against the
 * constant, while a release is cut from package.json: letting the two drift
 * means modules are accepted or refused against a version nobody shipped.
 */
export function checkKernelVersion(): boolean {
  const manifest = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { version?: unknown };

  if (valid(KERNEL_VERSION) === null) {
    console.error(
      `KERNEL_VERSION is "${KERNEL_VERSION}", which is not a semver version.`,
    );
    return false;
  }

  if (manifest.version !== KERNEL_VERSION) {
    console.error(
      `package.json is at version ${JSON.stringify(manifest.version)} and KERNEL_VERSION is "${KERNEL_VERSION}".\nBoth name the same release -- cli/lib/kernel-version.ts is the one a generated\nproject keeps, so it is the one every module is checked against.`,
    );
    return false;
  }

  console.log(
    `✔ the kernel version is declared once and matches package.json (${KERNEL_VERSION})`,
  );

  return true;
}

if (require.main === module) {
  process.exit(checkKernelVersion() ? 0 : 1);
}
