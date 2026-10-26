import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import {
  additiveMigrationProblems,
  isBreakingCommit,
  manifestTypeProblems,
  peerRangeProblems,
  versionProblems,
} from '../packages/cli/src/lib/release-rules';

const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join('prisma', 'migrations');
const BASE = process.env.HERY_RELEASE_BASE ?? 'origin/main';

interface Manifest {
  version?: string;
  type?: string;
  peerDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, dir, 'package.json'), 'utf8'),
  ) as Manifest;
}

function packageDirs(): string[] {
  return readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(
          path.join(REPO_ROOT, 'packages', entry.name, 'package.json'),
        ),
    )
    .map((entry) => path.join('packages', entry.name))
    .sort();
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

function migrationProblems(): string[] {
  const mergeBase = git(['merge-base', BASE, 'HEAD'])?.trim();

  if (!mergeBase) {
    console.log(
      pc.yellow(`! no ${BASE} to compare with, kernel migrations not checked`),
    );
    return [];
  }

  const added = (
    git([
      'diff',
      '--name-only',
      '--diff-filter=A',
      mergeBase,
      '--',
      MIGRATIONS,
    ]) ?? ''
  )
    .split('\n')
    .filter((file) => file.endsWith('migration.sql'))
    .filter((file) => existsSync(path.join(REPO_ROOT, file)))
    .map((file) => ({
      name: path.basename(path.dirname(file)),
      sql: readFileSync(path.join(REPO_ROOT, file), 'utf8'),
    }));
  const messages = (
    git(['log', '--format=%B%x00', `${mergeBase}..HEAD`]) ?? ''
  ).split('\0');

  return additiveMigrationProblems(added, messages.some(isBreakingCommit));
}

/**
 * The release rules of the packages HeryJs publishes together: one version
 * for all of them, peers between them at that same version, a declared module
 * system, and kernel migrations that only add outside a breaking change.
 */
export function checkReleaseRules(): boolean {
  const release = readManifest('.').version ?? '';
  const dirs = packageDirs();
  const manifests = dirs.map((dir) => ({ dir, manifest: readManifest(dir) }));
  const problems = [
    ...versionProblems(
      release,
      manifests.map(({ dir, manifest }) => ({
        name: dir,
        version: manifest.version,
      })),
    ),
    ...manifests.flatMap(({ dir, manifest }) => [
      ...manifestTypeProblems(dir, manifest),
      ...peerRangeProblems(dir, manifest.peerDependencies ?? {}),
    ]),
    ...migrationProblems(),
  ];

  if (problems.length > 0) {
    problems.forEach((problem) => console.error(pc.red(`✖ ${problem}`)));

    return false;
  }

  console.log(
    pc.green(
      `✔ ${dirs.length} packages ship at ${release}, peer on each other at that version, and kernel migrations only add`,
    ),
  );

  return true;
}

if (require.main === module) {
  process.exit(checkReleaseRules() ? 0 : 1);
}
