/**
 * A module is its default export, and nothing here imports HeryJs: the shape
 * is the contract, so a published package carries no runtime dependency on the
 * framework it extends. `defineModule` exists for the inference only, and a
 * package that wants it can import it from a devDependency without shipping
 * one.
 */
export default {
  name: 'maintenance',
  description: 'Answer 503 while the app is in maintenance, except for admins.',
  meta: { compatibility: '>=0.0.1' },

  install(context: {
    copyRuntime(): void;
    nextSteps(steps: string[]): void;
  }): void {
    context.copyRuntime();

    context.nextSteps([
      'Register MaintenanceGuard as a global guard in src/app.module.ts',
      'Set MAINTENANCE_ENABLED=true in .env to turn it on, anything else leaves it off',
      'Run "pnpm test" -- the module ships its own spec, and copyRuntime copied it in',
    ]);
  },
};
