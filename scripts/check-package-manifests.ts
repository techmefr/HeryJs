import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { intersects, validRange } from 'semver';
import * as ts from 'typescript';
import {
  CLI_PACKAGE,
  CLI_PACKAGE_DIR,
  DEVTOOLS_PUBLIC_ENTRIES,
  KERNEL_INTERNAL_SUBPATH,
  KERNEL_PACKAGE,
  KERNEL_PACKAGE_DIR,
  KERNEL_PUBLIC_ENTRIES,
  KERNEL_SOURCE_CONDITION,
  isTestSupport,
  kernelEntryFile,
} from '../packages/cli/src/lib/kernel-public-api';
import { loadOfficialModules } from '../packages/cli/src/lib/module-discovery';
import {
  packageNameOf,
  runtimeImports,
} from '../packages/cli/src/lib/runtime-imports';

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_RANGE = /^workspace:/;

interface PackageManifest {
  main?: string;
  types?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

function readManifest(file: string): PackageManifest {
  return JSON.parse(readFileSync(file, 'utf8')) as PackageManifest;
}

function isTestOnly(file: string): boolean {
  return (
    /\.(spec|integration-spec|e2e-spec|fakes|factory)\.ts$/.test(file) ||
    file.endsWith('.d.ts')
  );
}

function shippedSources(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  if (
    existsSync(path.join(dir, 'package.json')) &&
    path.basename(dir) === 'runtime'
  ) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : shippedSources(full);
    }

    return entry.name.endsWith('.ts') && !isTestOnly(full) ? [full] : [];
  });
}

/**
 * The packages a module's shipped code loads, types included: a peer the type
 * checker needs is a peer the installing project has to provide. A runtime that
 * carries its own manifest is its own workspace and answers to that manifest.
 */
export function requiredPeers(packageDir: string): string[] {
  const names = new Set(
    shippedSources(path.join(packageDir, 'src')).flatMap((file) =>
      runtimeImports(readFileSync(file, 'utf8'), true),
    ),
  );

  return [...names].sort();
}

/**
 * The packages a file imports, read from its syntax tree rather than its text:
 * the CLI's templates hold the imports of the code it generates, which are the
 * generated project's dependencies, not its own.
 */
function parsedImports(file: string): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    const specifier =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) &&
                node.expression.text === 'require')) &&
            node.arguments[0] !== undefined &&
            ts.isStringLiteral(node.arguments[0])
          ? node.arguments[0].text
          : undefined;
    const name = specifier === undefined ? undefined : packageNameOf(specifier);

    if (name !== undefined) {
      names.push(name);
    }

    ts.forEachChild(node, visit);
  };

  visit(
    ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    ),
  );

  return names;
}

function exportsProblems(name: string, manifest: PackageManifest): string[] {
  const root = manifest.exports?.['.'] as
    { types?: string; default?: string } | undefined;
  const problems: string[] = [];

  if (root?.default !== `./${manifest.main}`) {
    problems.push(
      `${name} exports "." as ${JSON.stringify(root?.default)}, not its main ./${manifest.main}`,
    );
  }

  if (root?.types !== `./${manifest.types}`) {
    problems.push(
      `${name} exports "." types as ${JSON.stringify(root?.types)}, not ./${manifest.types}`,
    );
  }

  if (manifest.exports?.['./package.json'] !== './package.json') {
    problems.push(
      `${name} does not export ./package.json, which the CLI resolves to find the module`,
    );
  }

  return problems;
}

function installedRange(
  peer: string,
  manifest: PackageManifest,
  root: PackageManifest,
): string | undefined {
  return (
    manifest.devDependencies?.[peer] ??
    root.dependencies?.[peer] ??
    root.devDependencies?.[peer]
  );
}

/**
 * A file the kernel runs something in when it is loaded, rather than only
 * declaring: a bundler told the package has no side effects would drop it.
 */
function hasTopLevelEffect(file: string): boolean {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
  );

  return source.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) ||
      (ts.isImportDeclaration(statement) &&
        statement.importClause === undefined),
  );
}

/**
 * @heryjs/core is built from src/technical, so its manifest answers to that
 * folder: one subpath per public entry and no other, exactly the peers the
 * kernel's shipped code imports, and the files that run on load listed as
 * side effects. It stays private until it is published.
 */
function kernelPackageProblems(root: PackageManifest): string[] {
  const name = KERNEL_PACKAGE_DIR;
  const manifest = readManifest(
    path.join(REPO_ROOT, KERNEL_PACKAGE_DIR, 'package.json'),
  ) as PackageManifest & {
    name?: string;
    private?: boolean;
    files?: string[];
    sideEffects?: boolean | string[];
  };
  const sourceRoot = path.join(REPO_ROOT, 'src');
  const kernelDir = path.join(sourceRoot, 'technical');
  const devtoolsDir = path.join(sourceRoot, 'devtools');
  const problems: string[] = [];

  if (manifest.name !== KERNEL_PACKAGE) {
    problems.push(`${name} is named ${manifest.name}, not ${KERNEL_PACKAGE}`);
  }

  if (manifest.private !== true) {
    problems.push(`${name} is not private, and nothing is published yet`);
  }

  if (JSON.stringify(manifest.files) !== JSON.stringify(['dist', 'prisma'])) {
    problems.push(
      `${name} publishes ${JSON.stringify(manifest.files)}, not dist and prisma alone: its sources are symlinks into this repository, and hery sync reads the kernel schema from prisma/`,
    );
  }

  const fromSourceRoot = (file: string): string =>
    path.relative(sourceRoot, file).split(path.sep).join('/');
  const subpath = (source: string): Record<string, string> => ({
    [KERNEL_SOURCE_CONDITION]: `./src/${source}.ts`,
    types: `./dist/${source}.d.ts`,
    default: `./dist/${source}.js`,
  });
  const expected: Record<string, unknown> = Object.fromEntries([
    ...[...KERNEL_PUBLIC_ENTRIES, ...Object.keys(DEVTOOLS_PUBLIC_ENTRIES)].map(
      (entry): [string, unknown] => [
        `./${entry}`,
        subpath(
          fromSourceRoot(path.join(REPO_ROOT, kernelEntryFile(entry))).replace(
            /\.ts$/,
            '',
          ),
        ),
      ],
    ),
    [`./${KERNEL_INTERNAL_SUBPATH}/*`, subpath(`${KERNEL_INTERNAL_SUBPATH}/*`)],
    ['./package.json', './package.json'],
  ]);

  if (JSON.stringify(manifest.exports) !== JSON.stringify(expected)) {
    problems.push(
      `${name} exports ${JSON.stringify(Object.keys(manifest.exports ?? {}))}, not one subpath per public entry and ./${KERNEL_INTERNAL_SUBPATH}/*, each with its sources under the ${KERNEL_SOURCE_CONDITION} condition and dist otherwise`,
    );
  }

  const sources = [
    ...shippedSources(kernelDir),
    ...shippedSources(devtoolsDir).filter((file) => !isTestSupport(file)),
    ...shippedSources(path.join(sourceRoot, 'hery')),
  ];
  const effects = sources
    .filter(hasTopLevelEffect)
    .map((file) => `./dist/${fromSourceRoot(file).replace(/\.ts$/, '.js')}`)
    .sort();

  if (
    !Array.isArray(manifest.sideEffects) ||
    JSON.stringify([...manifest.sideEffects].sort()) !== JSON.stringify(effects)
  ) {
    problems.push(
      `${name} lists ${JSON.stringify(manifest.sideEffects)} as side effects, but the files that run code on load are ${JSON.stringify(effects)}`,
    );
  }

  const required = [
    ...new Set(
      sources
        .flatMap((file) => runtimeImports(readFileSync(file, 'utf8'), true))
        .filter((peer) => peer !== KERNEL_PACKAGE),
    ),
  ].sort();
  const declared = manifest.peerDependencies ?? {};

  required
    .filter((peer) => declared[peer] === undefined)
    .forEach((peer) =>
      problems.push(
        `${name} imports ${peer} but declares no peerDependency on it`,
      ),
    );

  Object.entries(declared).forEach(([peer, range]) => {
    const installed =
      manifest.peerDependenciesMeta?.[peer]?.optional === true
        ? (root.dependencies?.[peer] ?? root.devDependencies?.[peer])
        : root.dependencies?.[peer];

    if (!required.includes(peer)) {
      problems.push(
        `${name} declares a peerDependency on ${peer}, which the kernel does not import`,
      );
    } else if (installed === undefined || !intersects(range, installed)) {
      problems.push(
        `${name} declares ${peer}@${range}, which the root dependencies (${installed}) do not satisfy`,
      );
    }
  });

  return problems;
}

/**
 * @heryjs/cli holds the tooling a project runs against its own code, so the
 * project installs it rather than carrying it: private until it is published,
 * dist alone, and exactly the peers its sources import.
 */
function cliPackageProblems(): string[] {
  const name = CLI_PACKAGE_DIR;
  const packageDir = path.join(REPO_ROOT, CLI_PACKAGE_DIR);
  const manifest = readManifest(
    path.join(packageDir, 'package.json'),
  ) as PackageManifest & { name?: string; private?: boolean; files?: string[] };
  const problems: string[] = [];

  if (manifest.name !== CLI_PACKAGE) {
    problems.push(`${name} is named ${manifest.name}, not ${CLI_PACKAGE}`);
  }

  if (manifest.private !== true) {
    problems.push(`${name} is not private, and nothing is published yet`);
  }

  if (JSON.stringify(manifest.files) !== JSON.stringify(['bin', 'dist'])) {
    problems.push(
      `${name} publishes ${JSON.stringify(manifest.files)}, not bin and dist alone`,
    );
  }

  const required = [
    ...new Set(
      [
        ...shippedSources(path.join(packageDir, 'src')),
        ...readdirSync(path.join(packageDir, 'bin')).map((file) =>
          path.join(packageDir, 'bin', file),
        ),
      ].flatMap(parsedImports),
    ),
  ]
    .filter((dependency) => dependency !== CLI_PACKAGE)
    .sort();
  const declared = Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  }).sort();

  if (JSON.stringify(required) !== JSON.stringify(declared)) {
    problems.push(
      `${name} declares ${JSON.stringify(declared)} as dependencies and peers, but its sources import ${JSON.stringify(required)}`,
    );
  }

  if (existsSync(path.join(REPO_ROOT, 'cli'))) {
    problems.push(
      `cli/ is back: the CLI lives in ${CLI_PACKAGE}, which projects install instead of copying`,
    );
  }

  return problems;
}

/**
 * Each module package declares an `exports` map matching its entry, and
 * exactly the peers its shipped code imports, at a range the repository
 * itself satisfies. A peer the code stopped using, or one it started using
 * without declaring, is drift the published package would carry silently.
 */
export function checkPackageManifests(): boolean {
  const root = readManifest(path.join(REPO_ROOT, 'package.json'));
  const problems: string[] = [];
  const modules = loadOfficialModules();

  for (const module of modules) {
    const name = path.relative(REPO_ROOT, module.packageDir);
    const manifest = readManifest(path.join(module.packageDir, 'package.json'));
    const declared = manifest.peerDependencies ?? {};
    const required = requiredPeers(module.packageDir);

    problems.push(...exportsProblems(name, manifest));

    required
      .filter((peer) => declared[peer] === undefined)
      .forEach((peer) =>
        problems.push(
          `${name} imports ${peer} but declares no peerDependency on it`,
        ),
      );

    Object.keys(declared)
      .filter((peer) => !required.includes(peer))
      .forEach((peer) =>
        problems.push(
          `${name} declares a peerDependency on ${peer}, which nothing it ships imports`,
        ),
      );

    Object.entries(declared)
      .filter(([peer]) => required.includes(peer))
      .forEach(([peer, range]) => {
        if (WORKSPACE_RANGE.test(range)) {
          return;
        }

        const installed = installedRange(peer, manifest, root);

        if (validRange(range) === null) {
          problems.push(
            `${name} declares ${peer}@${range}, which is not a semver range`,
          );
        } else if (installed === undefined) {
          problems.push(
            `${name} declares ${peer} as a peer, but nothing in this repository installs it`,
          );
        } else if (
          !WORKSPACE_RANGE.test(installed) &&
          !intersects(range, installed)
        ) {
          problems.push(
            `${name} declares ${peer}@${range}, which the ${installed} this repository installs does not satisfy`,
          );
        }
      });
  }

  problems.push(...kernelPackageProblems(root));
  problems.push(...cliPackageProblems());

  if (problems.length > 0) {
    problems.forEach((problem) => console.error(pc.red(`✖ ${problem}`)));

    return false;
  }

  console.log(
    pc.green(
      `✔ ${modules.length} module packages and ${KERNEL_PACKAGE} declare their exports and exactly the peers they import`,
    ),
  );

  return true;
}
