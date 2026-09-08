import { readFileSync, writeFileSync } from 'node:fs';

export const PACKAGE_MANIFEST = 'package.json';
export const WORKSPACE_MANIFEST = 'pnpm-workspace.yaml';

const WORKSPACE_ANCHOR = 'packages:\n';

/**
 * The two ways there is nothing to chain are worth telling apart: one is a
 * second install, the other is a project shaped differently from the one the
 * module expected. Reported as one skip, the second hid behind the first.
 */
export type ChainOutcome = 'chained' | 'already chained' | 'no such script';

/**
 * Chains a command onto a root script, for a module that installs a workspace
 * with a toolchain of its own -- the admin panel lints and tests browser code,
 * which the root suites cannot run.
 */
export function chainScript(
  filePath: string,
  script: string,
  command: string,
): ChainOutcome {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const existing = manifest.scripts?.[script];

  if (existing === undefined) {
    return 'no such script';
  }

  if (existing.includes(command)) {
    return 'already chained';
  }

  manifest.scripts = {
    ...manifest.scripts,
    [script]: `${existing} && ${command}`,
  };

  writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return 'chained';
}

/**
 * Declares a directory as a pnpm workspace, for a module that installs one.
 * Guarded on the directory already being listed.
 */
export function addWorkspace(filePath: string, directory: string): boolean {
  const source = readFileSync(filePath, 'utf8');

  if (source.includes(`'${directory}'`)) {
    return false;
  }

  if (!source.includes(WORKSPACE_ANCHOR)) {
    throw new Error(`${filePath} declares no packages list`);
  }

  writeFileSync(
    filePath,
    source.replace(WORKSPACE_ANCHOR, `${WORKSPACE_ANCHOR}  - '${directory}'\n`),
  );

  return true;
}
