import { buildConcern, CONCERN_KINDS } from './make-concern';

function kind(command: string) {
  const found = CONCERN_KINDS.find((entry) => entry.command === command);

  if (!found) {
    throw new Error(`No concern kind named ${command}`);
  }

  return found;
}

describe('make:job', () => {
  /**
   * The name is used both as the thing and as its category, so keeping the
   * suffix produced `SEND_DIGEST_JOB_JOB` and a `SendDigestJobProcessor`.
   * Stripping it first makes both spellings of the name produce one file.
   */
  it('derives the same file whether the name carries the suffix or not', () => {
    const withSuffix = buildConcern(kind('job'), 'SendDigestJob');
    const without = buildConcern(kind('job'), 'SendDigest');

    expect(withSuffix.fileName).toBe('send-digest.ts');
    expect(withSuffix.source).toBe(without.source);
  });

  it('names the job and its policy after the work, not after the word job', () => {
    const job = buildConcern(kind('job'), 'SendDigestJob');

    expect(job.source).toContain(
      "export const SEND_DIGEST_JOB = 'send-digest'",
    );
    expect(job.source).toContain('export const SEND_DIGEST_POLICY');
    expect(job.source).toContain('class SendDigestProcessor');
  });

  // A job generated without one inherits BullMQ's defaults: one attempt, no
  // backoff. That is the omission the scaffold exists to prevent.
  it('ships a retry policy rather than leaving the job to inherit none', () => {
    expect(buildConcern(kind('job'), 'SendDigest').source).toContain(
      'DEFAULT_JOB_POLICY',
    );
  });

  it('guards on the job name, since workers share a queue', () => {
    expect(buildConcern(kind('job'), 'SendDigest').source).toContain(
      'if (job.name !== SEND_DIGEST_JOB)',
    );
  });
});

describe('make:listener', () => {
  it('keys the subscription on the event class rather than a string', () => {
    const listener = buildConcern(kind('listener'), 'WelcomeListener');

    expect(listener.fileName).toBe('welcome.ts');
    expect(listener.source).toContain('class WelcomeListener');
    expect(listener.source).toContain('EventListener<WelcomeEvent>');
  });

  it('carries a stable name, because a queued job travels with it', () => {
    expect(buildConcern(kind('listener'), 'Welcome').source).toContain(
      "readonly name = 'welcome'",
    );
  });
});

describe('make:scheduled-task', () => {
  it('records its runs instead of firing silently', () => {
    const task = buildConcern(kind('scheduled-task'), 'ExpireTokensTask');

    expect(task.fileName).toBe('expire-tokens.ts');
    expect(task.source).toContain('class ExpireTokensTask');
    expect(task.source).toContain('ScheduledTaskStore');
    expect(task.source).toContain("this.store.run('expire-tokens'");
  });

  it('puts a task in the domain the caller names rather than its own', () => {
    expect(
      buildConcern(kind('scheduled-task'), 'ExpireTokens', 'Auth').domain,
    ).toBe('auth');
  });
});

describe('make:policy', () => {
  it('writes a named capability that defaults to admin only', () => {
    const policy = buildConcern(kind('policy'), 'ManageInvoicesPolicy');

    expect(policy.fileName).toBe('manage-invoices.policy.ts');
    expect(policy.domain).toBe('manage-invoices');
    expect(policy.source).toContain(
      'export const canManageInvoices: PolicyCheck = adminAbility;',
    );
  });
});

describe('make:seeder', () => {
  it('exposes one bounded action restricted to development and test', () => {
    const seeder = buildConcern(kind('seeder'), 'InvoiceSeeder');

    expect(seeder.fileName).toBe('invoice.seeder.ts');
    expect(seeder.source).toContain("@ExposeAction('invoice.seed'");
    expect(seeder.source).toContain("environments: ['development', 'test']");
    expect(seeder.source).toContain('max: 500');
    expect(seeder.source).toContain('class InvoiceSeeder');
  });

  it('camel-cases a multi-word action name', () => {
    expect(buildConcern(kind('seeder'), 'BlogPostSeeder').source).toContain(
      "'blogPost.seed'",
    );
  });
});

describe('make:notification', () => {
  it('declares every channel against the notifier contract', () => {
    const notification = buildConcern(kind('notification'), 'OrderShipped');

    expect(notification.fileName).toBe('order-shipped.notification.ts');
    expect(notification.source).toContain(
      'class OrderShippedNotification implements Notification',
    );
    expect(notification.source).toContain('toMail(');
    expect(notification.source).toContain('toSms(');
    expect(notification.source).toContain('toPush(');
  });
});

describe('make:webhook-handler', () => {
  it('derives the source from the name without its suffix', () => {
    const handler = buildConcern(
      kind('webhook-handler'),
      'StripeWebhookHandler',
    );

    expect(handler.fileName).toBe('stripe.webhook-handler.ts');
    expect(handler.source).toContain("STRIPE_WEBHOOK_SOURCE = 'stripe'");
    expect(handler.source).toContain('class StripeWebhookHandler');
  });

  it('registers itself so the webhook processor can find it', () => {
    const source = buildConcern(kind('webhook-handler'), 'Stripe').source;

    expect(source).toContain('registerWebhookHandler(this)');
    expect(source).toContain('implements WebhookHandler, OnModuleInit');
  });
});
