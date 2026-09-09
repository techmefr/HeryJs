import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'admin-astro',
  description:
    'Add an admin panel built with Astro. Sections are discovered from GET /introspect, so any module that ships a listable route appears without touching the admin.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'admin',
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addWorkspace('admin');

    /**
     * The admin ships its own toolchain -- its own eslint config and its own
     * test runner, because its code is browser code and the root suites run
     * under node. So the root scripts have to delegate to it. Without the lint
     * delegation the admin installs a workspace nothing lints, which the
     * coverage check reports as unreached source -- correctly, since it is;
     * and without the test delegation it installs a runner and a suite nothing
     * ever runs, which is worse than shipping neither.
     */
    context.chainScript('lint', 'pnpm --filter admin lint');
    context.chainScript('test', 'pnpm --filter admin test');

    context.nextSteps([
      `Run "pnpm install" to install the admin workspace`,
      `Run "pnpm --filter admin dev" and sign in with an account of your API`,
      `Point it elsewhere with "PUBLIC_API_URL" if the API is not on http://localhost:3000`,
    ]);
  },
} satisfies ModuleDefinition;
