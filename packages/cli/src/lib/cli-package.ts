import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { COPIED_CLI_FILES } from './copied-cli';

export const COPIED_CLI_DIR = 'cli';

const CLI_ENTRY =
  /\bts-node (?:[^"]*? )?(?:packages\/cli\/src|cli)\/hery\.ts\b/g;

export const MODULE_CONTRACT_TYPES =
  'node_modules/@heryjs/cli/dist/module-contract.d.ts';

const COPIED_REGISTRY_GENERATOR =
  /provider = "node cli\/prisma-registry-generator\.ts"/g;
export const REGISTRY_GENERATOR =
  'provider = "node node_modules/@heryjs/cli/bin/prisma-registry-generator.js"';

function prismaFilesUnder(dir: string): string[] {
  return filesUnder(dir).filter((file) => file.endsWith('.prisma'));
}

/**
 * A package script that ran the CLI from its sources, copied into the
 * project, now runs the `hery` bin of the installed @heryjs/cli.
 */
export function withCliBin(command: string): string {
  return command.replace(CLI_ENTRY, 'hery');
}

export interface CopiedCli {
  identical: string[];
  modified: string[];
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

/**
 * The CLI an older `hery new` copied into the project, split by whether each
 * file is still byte for byte one this repository shipped.
 */
export function copiedCli(
  root: string,
  shipped: Readonly<Record<string, readonly string[]>> = COPIED_CLI_FILES,
): CopiedCli {
  const files = filesUnder(path.join(root, COPIED_CLI_DIR))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .sort();
  const isShipped = (file: string): boolean =>
    shipped[file]?.includes(
      createHash('sha256')
        .update(readFileSync(path.join(root, file)))
        .digest('hex'),
    ) === true;

  return {
    identical: files.filter(isShipped),
    modified: files.filter((file) => !isShipped(file)),
  };
}

function removeEmptyDirs(dir: string): void {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyDirs(path.join(dir, entry.name));
    }
  }

  if (readdirSync(dir).length === 0) {
    rmdirSync(dir);
  }
}

/**
 * Removes the copied CLI files that are still the framework's and points the
 * package scripts at the installed @heryjs/cli. Returns the files that
 * changed, or would change when `write` is off.
 */
export function adoptCliPackage(
  root: string,
  { identical }: CopiedCli,
  { write }: { write: boolean },
): string[] {
  const changed = [...identical];

  if (write) {
    identical.forEach((file) => rmSync(path.join(root, file)));
    removeEmptyDirs(path.join(root, COPIED_CLI_DIR));
  }

  const manifestFile = path.join(root, 'package.json');

  if (!existsSync(manifestFile)) {
    return changed;
  }

  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = Object.fromEntries(
    Object.entries(manifest.scripts ?? {}).map(([name, command]) => [
      name,
      withCliBin(command),
    ]),
  );

  if (JSON.stringify(scripts) !== JSON.stringify(manifest.scripts ?? {})) {
    changed.push('package.json');

    if (write) {
      writeFileSync(
        manifestFile,
        `${JSON.stringify({ ...manifest, scripts }, null, 2)}\n`,
      );
    }
  }

  for (const full of prismaFilesUnder(path.join(root, 'prisma'))) {
    const source = readFileSync(full, 'utf8');
    const next = source.replace(COPIED_REGISTRY_GENERATOR, REGISTRY_GENERATOR);

    if (next !== source) {
      changed.push(path.relative(root, full));

      if (write) {
        writeFileSync(full, next);
      }
    }
  }

  for (const file of tsconfigsNamingTheContract(root)) {
    const full = path.join(root, file);
    const source = readFileSync(full, 'utf8');
    const next = withInstalledContract(source, file);

    if (next !== source) {
      changed.push(file);

      if (write) {
        writeFileSync(full, next);
      }
    }
  }

  return changed;
}

const CONTRACT_SOURCE =
  /"(?:\.\/|(?:\.\.\/)+)(?:cli|packages\/cli\/src|cli\/src)\/module-contract\.ts"/g;

/**
 * The `heryjs` path of a tsconfig, which pointed at the contract in the
 * copied CLI, to the declaration the installed @heryjs/cli carries.
 */
export function withInstalledContract(source: string, file: string): string {
  const depth = file.split('/').length - 1;
  const prefix = depth === 0 ? './' : '../'.repeat(depth);

  return source.replace(CONTRACT_SOURCE, `"${prefix}${MODULE_CONTRACT_TYPES}"`);
}

function tsconfigsNamingTheContract(root: string): string[] {
  const packagesDir = path.join(root, 'packages');
  const packageConfigs = existsSync(packagesDir)
    ? readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/tsconfig.json`)
    : [];

  return ['tsconfig.json', ...packageConfigs].filter((file) =>
    existsSync(path.join(root, file)),
  );
}
