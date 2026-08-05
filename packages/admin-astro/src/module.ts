import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'admin';
const WORKSPACE_FILE = 'pnpm-workspace.yaml';

function addWorkspaceMember(): void {
  if (!existsSync(WORKSPACE_FILE)) {
    return;
  }

  const current = readFileSync(WORKSPACE_FILE, 'utf8');

  if (current.includes("'admin'")) {
    return;
  }

  writeFileSync(
    WORKSPACE_FILE,
    current.replace('packages:\n', "packages:\n  - 'admin'\n"),
  );
  console.log(pc.green(`✔ patched ${WORKSPACE_FILE}`));
}

/**
 * The admin ships its own eslint config, so the root lint script has to delegate
 * to it. Without this the admin installs a workspace nothing lints, which the
 * coverage check reports as unreached source — correctly, since it is.
 */
function delegateLintToAdmin(): void {
  const packageFile = 'package.json';

  if (!existsSync(packageFile)) {
    return;
  }

  const source = readFileSync(packageFile, 'utf8');
  const manifest = JSON.parse(source) as {
    scripts?: Record<string, string>;
  };
  const lint = manifest.scripts?.lint;

  if (lint === undefined || lint.includes('--filter admin lint')) {
    return;
  }

  manifest.scripts = {
    ...manifest.scripts,
    lint: `${lint} && pnpm --filter admin lint`,
  };
  writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(pc.green(`✔ patched ${packageFile}`));
}

registerModule({
  name: 'admin-astro',
  channel: 'official',
  description:
    'Add an admin panel built with Astro. Sections are discovered from GET /introspect, so any module that ships a listable route appears without touching the admin.',
  dependencies: [],
  install() {
    copyRuntime(RUNTIME_DIR, DEST_DIR);

    addWorkspaceMember();
    delegateLintToAdmin();

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Run ${pc.bold('pnpm install')} to install the admin workspace`,
    );
    console.log(
      `  2. Run ${pc.bold('pnpm --filter admin dev')} and sign in with an account of your API`,
    );
    console.log(
      `  3. Point it elsewhere with ${pc.bold('PUBLIC_API_URL')} if the API is not on http://localhost:3000`,
    );
  },
});
