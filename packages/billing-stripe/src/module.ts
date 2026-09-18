import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'billing-stripe',
  description:
    'Verify and parse Stripe webhooks with node:crypto only, as a billing driver',
  meta: { compatibility: '>=0.0.1' },
  // The owning module's folder, not its own: a module may not import another
  // module, so a driver living in src/modules/billing-stripe could never reach
  // the BillingDriver contract. Landing beside billing makes the import a
  // sibling one, and makes uninstalling billing take its drivers with it.
  dest: 'src/modules/billing',
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "StripeBillingModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { billing: { default: 'stripe', drivers: { log: { driver: 'log' }, stripe: { driver: 'stripe' } } } }",
      'Set STRIPE_WEBHOOK_SECRET in .env, from the endpoint you register in the Stripe dashboard pointing at POST /billing/webhook',
      'Attach tenantId and plan as metadata on the subscription or customer when creating it -- this driver refuses an event it cannot attribute',
    ]);
  },
} satisfies ModuleDefinition;
