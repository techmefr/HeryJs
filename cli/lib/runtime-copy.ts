import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';

// A module's runtime/ is written against the app's kernel through #kernel/, so
// tsconfig.json in the module's own package can map it to ../../src/technical/*
// and type-check/lint the file where it is authored, instead of a string
// template nothing checks until it lands in a generated project.
//
// It lands as #technical/, the app's own subpath import, rather than as a
// relative path computed from the destination: modules land at three different
// depths (src/modules/<name>/, src/technical/search/, src/ itself), so a
// relative rewrite produced a different file for each of them, and none of them
// matched the copy this repository keeps under src/modules/ -- which is the copy
// every convention check and every reader actually sees. One specifier means the
// installed file is the authored file, and `pnpm lint:module-drift` can say so.
const KERNEL_SPECIFIER = '#kernel/';
const APP_KERNEL_SPECIFIER = '#technical/';

export function rewriteKernelSpecifiers(source: string): string {
  return source.split(KERNEL_SPECIFIER).join(APP_KERNEL_SPECIFIER);
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

    const content = rewriteKernelSpecifiers(readFileSync(sourcePath, 'utf8'));
    mkdirSync(path.dirname(destPath), { recursive: true });
    writeFileSync(destPath, content);
    console.log(pc.green(`✔ ${destPath}`));
  }
}
