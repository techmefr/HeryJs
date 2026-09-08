import pc from 'picocolors';
import { defineModule } from '../../../cli/lib/module-definition';
import type { InstallContext } from '../../../cli/lib/module-definition';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';
const PACKAGE_FILE = 'package.json';

/**
 * The admin ships its own toolchain -- its own eslint config and its own test
 * runner, because its code is browser code and the root suites run under node.
 * So the root scripts have to delegate to it. Without the lint delegation the
 * admin installs a workspace nothing lints, which the coverage check reports as
 * unreached source — correctly, since it is; and without the test delegation it
 * installs a runner and a suite nothing ever runs, which is worse than shipping
 * neither.
 */
function delegateToAdmin(context: InstallContext, script: string): void {
  const delegation = `pnpm --filter admin ${script}`;

  context.patch(PACKAGE_FILE, delegation, (source) => {
    const manifest = JSON.parse(source) as {
      scripts?: Record<string, string>;
    };
    const existing = manifest.scripts?.[script];

    if (existing === undefined) {
      return undefined;
    }

    manifest.scripts = {
      ...manifest.scripts,
      [script]: `${existing} && ${delegation}`,
    };

    return `${JSON.stringify(manifest, null, 2)}\n`;
  });
}

export default defineModule({
  name: 'admin-astro',
  description:
    'Add an admin panel built with Astro. Sections are discovered from GET /introspect, so any module that ships a listable route appears without touching the admin.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'admin',
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.patch(WORKSPACE_FILE, "'admin'", (source) =>
      source.replace('packages:\n', "packages:\n  - 'admin'\n"),
    );

    delegateToAdmin(context, 'lint');
    delegateToAdmin(context, 'test');

    context.nextSteps([
      `Run ${pc.bold('pnpm install')} to install the admin workspace`,
      `Run ${pc.bold('pnpm --filter admin dev')} and sign in with an account of your API`,
      `Point it elsewhere with ${pc.bold('PUBLIC_API_URL')} if the API is not on http://localhost:3000`,
    ]);
  },
});
