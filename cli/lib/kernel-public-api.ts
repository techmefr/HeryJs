import { existsSync } from 'node:fs';
import * as path from 'node:path';

/**
 * The kernel's public surface: one file per entry under src/technical/public,
 * each re-exporting by name what a module may use. Everything else under
 * src/technical is internal. An entry here is one subpath of the
 * `@heryjs/core` package's `exports`, which modules import as
 * `@heryjs/core/<entry>`.
 */
export const KERNEL_PUBLIC_ENTRIES = [
  'auth',
  'capabilities',
  'config',
  'database',
  'drivers',
  'env',
  'errors',
  'http',
  'i18n',
  'jobs',
  'load-env',
  'modules',
  'notifications',
  'observability',
  'platform',
  'privacy',
  'realtime',
  'resources',
  'tenancy',
  'testing',
] as const;

/**
 * The developer tools ship in the same package but live under src/devtools,
 * which the kernel itself never imports. Their test support stays with the
 * app: it boots the app's own AppModule, so it cannot be built without it.
 * `app` is HeryModule, under src/hery: it composes the kernel with the
 * devtools, which nothing under src/technical may import.
 */
export const DEVTOOLS_PUBLIC_ENTRIES = {
  devtools: path.join('src', 'devtools', 'public.ts'),
  conventions: path.join('src', 'devtools', 'conventions', 'index.ts'),
  app: path.join('src', 'hery', 'public.ts'),
} as const;

export function isTestSupport(file: string): boolean {
  const segments = file.split(path.sep);
  const devtools = segments.lastIndexOf('devtools');

  return (
    devtools !== -1 &&
    (segments[devtools + 1] === 'testing' ||
      segments[devtools + 1] === 'test-support.ts')
  );
}

export function kernelEntryFile(entry: string): string {
  return (
    (DEVTOOLS_PUBLIC_ENTRIES as Record<string, string>)[entry] ??
    path.join('src', 'technical', 'public', `${entry}.ts`)
  );
}

export const KERNEL_SPECIFIER = '#kernel/';
export const KERNEL_PUBLIC_SPECIFIER = `${KERNEL_SPECIFIER}public/`;
export const KERNEL_PUBLIC_DIR = path.join('src', 'technical', 'public');
export const KERNEL_PACKAGE = '@heryjs/core';
export const KERNEL_PACKAGE_SPECIFIER = `${KERNEL_PACKAGE}/`;
export const KERNEL_PACKAGE_DIR = path.join('packages', 'core');

/**
 * The export condition that points `@heryjs/core` at its TypeScript sources.
 * It is this repository's own, not `development`: a project that turns
 * `development` on would otherwise resolve to sources its tarball does not
 * carry.
 */
export const KERNEL_SOURCE_CONDITION = 'heryjs-source';

/**
 * The subpath a generated project reaches kernel internals through, as
 * `#technical/*`: its CLI and its test support still import them.
 */
export const KERNEL_INTERNAL_SUBPATH = 'technical';

/**
 * `#kernel/public/<entry>` is the form modules were written in before the
 * kernel became a package. It still resolves, and `hery kernel:migrate`
 * rewrites it to `@heryjs/core/<entry>`.
 */
export function isPublicKernelSpecifier(specifier: string): boolean {
  return [
    ...KERNEL_PUBLIC_ENTRIES,
    ...Object.keys(DEVTOOLS_PUBLIC_ENTRIES),
  ].some(
    (entry) =>
      specifier === `${KERNEL_PACKAGE_SPECIFIER}${entry}` ||
      specifier === `${KERNEL_PUBLIC_SPECIFIER}${entry}`,
  );
}

/**
 * A module that installs files into the kernel's own folders reaches them
 * through #kernel/ like any kernel file, since that is where they land. Those
 * are its own files, not the kernel's, so they stay reachable.
 */
export function isOwnKernelFile(
  specifier: string,
  runtimeDir: string,
  dest: string,
): boolean {
  if (!specifier.startsWith(KERNEL_SPECIFIER)) {
    return false;
  }

  const installedAt = path.join(
    'src',
    'technical',
    `${specifier.slice(KERNEL_SPECIFIER.length)}.ts`,
  );
  const relative = path.relative(dest, installedAt);

  return (
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    existsSync(path.join(runtimeDir, relative))
  );
}

export function internalKernelImportProblem(
  file: string,
  specifier: string,
): string {
  return `${file} imports ${specifier}, which is internal to the kernel — a module reaches it only through ${KERNEL_PUBLIC_ENTRIES.map((entry) => `${KERNEL_PACKAGE_SPECIFIER}${entry}`).join(', ')}`;
}
