const HERYJS_SCOPE = '@heryjs/';
const SAME_VERSION = 'workspace:*';
const MODULE_SYSTEMS = ['commonjs', 'module'];
const DESTRUCTIVE =
  /^\s*(DROP\s+(TABLE|COLUMN|TYPE|SCHEMA)\b|ALTER\s+TABLE\b.*\b(DROP\s+COLUMN|RENAME)\b|ALTER\s+TYPE\b.*\bRENAME\b)/i;
const BREAKING_SUBJECT = /^\w+(\([^)]*\))?!:/;

export interface VersionedPackage {
  name: string;
  version?: string;
}

export interface Migration {
  name: string;
  sql: string;
}

/** Every package ships at the release's version: one version for all. */
export function versionProblems(
  release: string,
  packages: readonly VersionedPackage[],
): string[] {
  return packages
    .filter((pkg) => pkg.version !== release)
    .map(
      (pkg) => `${pkg.name} is at ${pkg.version}, the release is ${release}`,
    );
}

/**
 * A HeryJs package peers on another at the version published with it, which
 * `workspace:*` becomes on publish; `workspace:^` lets a different kernel in.
 */
export function peerRangeProblems(
  name: string,
  peers: Readonly<Record<string, string>>,
): string[] {
  return Object.entries(peers)
    .filter(
      ([peer, range]) =>
        (peer === 'heryjs' || peer.startsWith(HERYJS_SCOPE)) &&
        range !== SAME_VERSION,
    )
    .map(
      ([peer, range]) =>
        `${name} peers on ${peer}@${range}, not ${SAME_VERSION} (the same version)`,
    );
}

export function manifestTypeProblems(
  name: string,
  manifest: { type?: string },
): string[] {
  if (manifest.type === undefined) {
    return [`${name} has no "type" field`];
  }

  return MODULE_SYSTEMS.includes(manifest.type)
    ? []
    : [`${name} has "type": "${manifest.type}"`];
}

export function destructiveStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('--') && DESTRUCTIVE.test(line));
}

export function isBreakingCommit(message: string): boolean {
  return (
    BREAKING_SUBJECT.test(message) || /^BREAKING[ -]CHANGE:/m.test(message)
  );
}

/**
 * A kernel migration a minor or a patch ships only adds: a project upgrading
 * keeps its data. Dropping or renaming waits for a `feat!` commit.
 */
export function additiveMigrationProblems(
  added: readonly Migration[],
  breaking: boolean,
): string[] {
  if (breaking) {
    return [];
  }

  return added.flatMap((migration) =>
    destructiveStatements(migration.sql).map(
      (statement) =>
        `${migration.name} drops or renames outside a feat! commit: ${statement}`,
    ),
  );
}
