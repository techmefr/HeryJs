import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import {
  KERNEL_INTERNAL_SUBPATH,
  KERNEL_PACKAGE,
  KERNEL_PACKAGE_DIR,
  KERNEL_PACKAGE_SPECIFIER,
  KERNEL_PUBLIC_ENTRIES,
  KERNEL_SOURCE_CONDITION,
} from './kernel-public-api';

/**
 * The folders the kernel used to be copied into. A project keeps the test
 * support of src/devtools: it boots the project's own AppModule, so the
 * package cannot build it.
 */
export const KERNEL_COPY_DIRS = [
  path.join('src', 'technical'),
  path.join('src', 'devtools'),
];
export const APP_SIDE_DEVTOOLS = [
  path.join('src', 'devtools', 'testing'),
  path.join('src', 'devtools', 'test-support.ts'),
];

const INTERNAL_TARGET = `${KERNEL_PACKAGE_SPECIFIER}${KERNEL_INTERNAL_SUBPATH}`;

/**
 * The one line a project changes to move to the published package: until
 * `@heryjs/core` is on the registry, it installs the package this checkout
 * builds, and afterwards it takes a version range instead.
 */
export function kernelDependency(frameworkRoot: string): string {
  return `file:${path.join(frameworkRoot, KERNEL_PACKAGE_DIR)}`;
}

export function kernelIsBuilt(frameworkRoot: string): boolean {
  return existsSync(path.join(frameworkRoot, KERNEL_PACKAGE_DIR, 'dist'));
}

interface ConsumerManifest {
  dependencies?: Record<string, string>;
  imports?: Record<string, unknown>;
  scripts?: Record<string, string>;
  jest?: { moduleNameMapper?: Record<string, string> };
}

/**
 * Points a jest mapper at the installed package rather than at a kernel
 * folder: the public entries resolve through the package's own exports, and
 * the internal aliases through its `./technical/*` subpath.
 */
export function withPackageKernelMapper(
  mapper: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapper).flatMap(([pattern, target]): [string, string][] => {
      if (pattern.startsWith(`^${KERNEL_PACKAGE_SPECIFIER}`)) {
        return [];
      }

      if (pattern === '^#technical/(.*)$' || pattern === '^#kernel/(.*)$') {
        return [[pattern, `${INTERNAL_TARGET}/$1`]];
      }

      return [[pattern, target]];
    }),
  );
}

/**
 * A project's manifest, reading the kernel from the installed package: the
 * dependency itself, `#technical/*` through the package, a jest mapper that
 * no longer points at src/technical, and no script that builds or selects
 * the kernel's sources.
 */
export function withKernelPackage<T extends ConsumerManifest>(
  manifest: T,
  dependency: string,
): T {
  const copy = structuredClone(manifest);

  copy.dependencies = { ...copy.dependencies, [KERNEL_PACKAGE]: dependency };
  copy.imports = { ...copy.imports, '#technical/*': `${INTERNAL_TARGET}/*` };

  if (copy.jest?.moduleNameMapper) {
    copy.jest.moduleNameMapper = withPackageKernelMapper(
      copy.jest.moduleNameMapper,
    );
  }

  if (copy.scripts) {
    delete copy.scripts['build:core'];
    delete copy.scripts['dev:core'];

    copy.scripts = Object.fromEntries(
      Object.entries(copy.scripts).map(([name, command]) => [
        name,
        command
          .split('pnpm run build:core && ')
          .join('')
          .split(` --conditions=${KERNEL_SOURCE_CONDITION}`)
          .join(''),
      ]),
    );
  }

  return copy;
}

/**
 * Each module package lists `heryjs@workspace:*`, and `@heryjs/core` by
 * workspace range, so this repository builds it against the kernel sitting
 * next to it. A project has neither workspace member, and the first
 * `pnpm install` refuses to resolve either name. The packages reach the kernel
 * through the project's own dependency instead.
 */
export function withoutKernelDependency(
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  const copy = structuredClone(manifest);

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const entries = copy[field] as Record<string, string> | undefined;

    if (entries) {
      delete entries.heryjs;

      if (entries[KERNEL_PACKAGE]?.startsWith('workspace:')) {
        delete entries[KERNEL_PACKAGE];
      }
    }
  }

  return copy;
}

const PUBLIC_IMPORT = new RegExp(
  `(['"])#(?:technical|kernel)/public/(${KERNEL_PUBLIC_ENTRIES.join('|')})\\1`,
  'g',
);

/** `#technical/public/<entry>` and `#devtools/public` to the package's entries. */
export function rewriteAppKernelImports(source: string): string {
  return source
    .replace(PUBLIC_IMPORT, `$1${KERNEL_PACKAGE_SPECIFIER}$2$1`)
    .replace(
      /(['"])#devtools\/public\1/g,
      `$1${KERNEL_PACKAGE_SPECIFIER}devtools$1`,
    );
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

function isAppSide(relative: string): boolean {
  return APP_SIDE_DEVTOOLS.some(
    (kept) => relative === kept || relative.startsWith(kept + path.sep),
  );
}

/** The kernel files a project carries as a copy, relative to its root. */
export function copiedKernelFiles(root: string): string[] {
  return KERNEL_COPY_DIRS.flatMap((dir) => filesUnder(path.join(root, dir)))
    .map((file) => path.relative(root, file))
    .filter((file) => !isAppSide(file))
    .sort();
}

export function hasCopiedKernel(root: string): boolean {
  return existsSync(path.join(root, KERNEL_COPY_DIRS[0]!));
}

/**
 * The copied files that differ from the kernel this CLI ships, or that it has
 * no file for. A file the project deleted is not one: `hery new` itself drops
 * the kernel specs written against the demo.
 */
export function modifiedKernelFiles(
  root: string,
  frameworkRoot: string,
): string[] {
  return copiedKernelFiles(root).filter((file) => {
    const reference = path.join(frameworkRoot, file);

    return (
      !existsSync(reference) ||
      !readFileSync(reference).equals(readFileSync(path.join(root, file)))
    );
  });
}

/** Deletes the copied kernel, keeping the test support the project owns. */
export function removeCopiedKernel(root: string): void {
  const devtools = path.join(root, 'src', 'devtools');

  rmSync(path.join(root, 'src', 'technical'), { recursive: true, force: true });

  if (existsSync(devtools)) {
    for (const entry of readdirSync(devtools)) {
      if (!isAppSide(path.join('src', 'devtools', entry))) {
        rmSync(path.join(devtools, entry), { recursive: true, force: true });
      }
    }
  }
}

/**
 * The image used to copy packages/core next to node_modules, where the
 * workspace link pointed. An installed package lives in node_modules itself.
 */
export const WORKSPACE_KERNEL_COPY = `# node_modules/@heryjs/core links to the workspace package, and the build
# imports the kernel from its dist.
COPY --from=build --chown=node:node /app/packages/core ./packages/core
`;

type Rewrite = [file: string, rewrite: (source: string) => string];

/** Where a project keeps the TypeScript that runs outside the app's src. */
const PROJECT_TOOLING_DIRS = ['cli', 'scripts', 'test'];

/**
 * A relative path into src/technical, which the CLI, the scripts and the e2e
 * setup still reach for in this repository, to the package's subpath.
 */
export function rewriteRelativeKernelImports(source: string): string {
  return source.replace(
    /((?:from|import|require\(|import\()\s*)(['"])(?:\.{1,2}\/)+src\/technical\//g,
    `$1$2${INTERNAL_TARGET}/`,
  );
}

function jsonRewrite<T>(rewrite: (value: T) => T): (source: string) => string {
  return (source) =>
    `${JSON.stringify(rewrite(JSON.parse(source) as T), null, 2)}\n`;
}

/**
 * Every file of a project that names the kernel copy, with the change that
 * makes it read the package instead. Shared by `hery new`, which writes a
 * project this way from the start, and `hery kernel:migrate`, which moves an
 * older one.
 */
export function kernelPackageRewrites(
  root: string,
  dependency: string,
): Rewrite[] {
  const packagesDir = path.join(root, 'packages');
  const moduleManifests = existsSync(packagesDir)
    ? readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join('packages', entry.name, 'package.json'))
    : [];

  return [
    [
      'package.json',
      jsonRewrite((manifest: ConsumerManifest) =>
        withKernelPackage(manifest, dependency),
      ),
    ],
    [
      'tsconfig.json',
      (source) => source.replace(/^[ \t]*"customConditions":.*\n/m, ''),
    ],
    ...['jest-e2e.json', 'jest-modules.json', 'jest-module-specs.json'].map(
      (file): Rewrite => [
        path.join('test', file),
        jsonRewrite(
          (config: { moduleNameMapper?: Record<string, string> }) => ({
            ...config,
            ...(config.moduleNameMapper && {
              moduleNameMapper: withPackageKernelMapper(
                config.moduleNameMapper,
              ),
            }),
          }),
        ),
      ],
    ),
    [
      path.join('test', 'tsconfig.modules.json'),
      (source) =>
        source.replace(
          /^[ \t]*"[^"]+": \["\.\.\/src\/technical\/[^"]*"\],?\n/gm,
          '',
        ),
    ],
    ...[
      'hery.config.ts',
      'cors.config.ts',
      ...PROJECT_TOOLING_DIRS.flatMap((dir) =>
        typescriptFilesUnder(path.join(root, dir)).map((file) =>
          path.relative(root, file),
        ),
      ),
    ].map((file): Rewrite => [file, rewriteRelativeKernelImports]),
    ['Dockerfile', (source) => source.replace(WORKSPACE_KERNEL_COPY, '')],
    ...moduleManifests.map((file): Rewrite => [
      file,
      jsonRewrite(withoutKernelDependency),
    ]),
  ];
}

/**
 * Applies the rewrites above to the files a project has. Returns the files
 * that changed, or would change when `write` is off, relative to `root`.
 */
export function applyKernelPackageRewrites(
  root: string,
  dependency: string,
  { write }: { write: boolean },
): string[] {
  const changed: string[] = [];

  for (const [file, rewrite] of kernelPackageRewrites(root, dependency)) {
    const full = path.join(root, file);

    if (!existsSync(full)) {
      continue;
    }

    const source = readFileSync(full, 'utf8');
    const next = rewrite(source);

    if (next !== source) {
      changed.push(file);

      if (write) {
        writeFileSync(full, next);
      }
    }
  }

  return changed;
}

function typescriptFilesUnder(dir: string): string[] {
  return filesUnder(dir).filter(
    (file) =>
      file.endsWith('.ts') &&
      !file.includes(`${path.sep}node_modules${path.sep}`),
  );
}

/**
 * Moves a project that still carries a copy of the kernel onto the package:
 * its public imports, its manifest and configuration, and the copy itself,
 * which goes last. The caller has already checked the copy is unmodified.
 */
export function adoptKernelPackage(
  root: string,
  frameworkRoot: string,
  { write }: { write: boolean },
): string[] {
  const changed: string[] = [];
  const kernelCopy = new Set(copiedKernelFiles(root));

  for (const file of ['src', 'test'].flatMap((dir) =>
    typescriptFilesUnder(path.join(root, dir)),
  )) {
    const relative = path.relative(root, file);

    if (kernelCopy.has(relative)) {
      continue;
    }

    const source = readFileSync(file, 'utf8');
    const next = rewriteAppKernelImports(source);

    if (next !== source) {
      changed.push(relative);

      if (write) {
        writeFileSync(file, next);
      }
    }
  }

  changed.push(
    ...applyKernelPackageRewrites(root, kernelDependency(frameworkRoot), {
      write,
    }),
  );

  const workspaceCopy = path.join(root, KERNEL_PACKAGE_DIR);

  if (existsSync(workspaceCopy)) {
    changed.push(KERNEL_PACKAGE_DIR);

    if (write) {
      rmSync(workspaceCopy, { recursive: true, force: true });
    }
  }

  changed.push(...kernelCopy);

  if (write) {
    removeCopiedKernel(root);
  }

  return changed;
}
