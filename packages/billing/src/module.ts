import type { ModuleDefinition } from 'heryjs';

const BILLING_SUBSCRIPTION_MODEL = `
model BillingSubscription {
  id                     String    @id @default(cuid())
  tenantId               String
  provider               String
  providerSubscriptionId String
  plan                   String
  status                 String
  currentPeriodEnd       DateTime
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  @@unique([provider, providerSubscriptionId])
  @@index([tenantId])
}
`;

export default {
  name: 'billing',
  description:
    'Ingest subscription state from a billing provider behind one contract, mirror it locally, and guard a quota against it -- never the checkout or plan-management calls.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(BILLING_SUBSCRIPTION_MODEL);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_billing_subscription"',
      'Import "BillingModule" into src/app.module.ts',
      "Declare it in hery.config.ts, e.g. { billing: { default: 'log', drivers: { log: { driver: 'log' } } } }",
      'Install a provider driver, e.g. "pnpm hery install billing-stripe", then point billing.default at it',
      "Declare what each plan grants in hery.config.ts's billingQuotas: { pro: { projects: 50 } }",
      'Guard a quota-bound action with BillingService.assertWithinQuota(tenantId, "projects", currentCount)',
      'Attach tenantId as metadata on the subscription or customer when creating it at your provider -- the webhook cannot attribute an event to a tenant without it',
    ]);
  },
} satisfies ModuleDefinition;
