import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';

// A module's runtime/ is written against the app's kernel through this
// specifier, so tsconfig.json in the module's own package can map it to
// ../../src/technical/* and type-check/lint the file where it is authored --
// exactly the problem the CI check-module-template-imports script exists to
// catch, moved one step earlier because the file is now real instead of a
// string. Most modules land two levels under src/ (src/modules/<name>/), but
// the two search drivers land directly inside the kernel's own src/technical
// /search/ -- so the rewrite target is computed per destination file rather
// than fixed, from that file's own directory back to src/technical.
const KERNEL_SPECIFIER = '#kernel/';

function kernelPrefixFor(destFileDir: string): string {
  const relative = path
    .relative(destFileDir, 'src/technical')
    .split(path.sep)
    .join('/');

  return `${relative.startsWith('.') ? relative : `./${relative}`}/`;
}

function rewriteKernelSpecifiers(source: string, destFileDir: string): string {
  return source.split(KERNEL_SPECIFIER).join(kernelPrefixFor(destFileDir));
}

/**
 * Copies every file under a module's `src/runtime/` into the app being
 * installed into, rewriting `#kernel/` specifiers to the real relative path
 * as it goes. Skips (and logs) any file the developer already has, exactly
 * like the string-template installers did.
 */
export function copyRuntime(runtimeDir: string, destDir: string): void {
  for (const entry of readdirSync(runtimeDir, { withFileTypes: true })) {
    const sourcePath = path.join(runtimeDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyRuntime(sourcePath, destPath);
      continue;
    }

    if (existsSync(destPath)) {
      console.log(pc.yellow(`${destPath} already exists, skipping.`));
      continue;
    }

    const content = rewriteKernelSpecifiers(
      readFileSync(sourcePath, 'utf8'),
      path.dirname(destPath),
    );
    mkdirSync(path.dirname(destPath), { recursive: true });
    writeFileSync(destPath, content);
    console.log(pc.green(`✔ ${destPath}`));
  }
}
