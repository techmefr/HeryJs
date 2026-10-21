import {
  clearWebhookHandlers,
  registerWebhookHandler,
  webhookHandlersFor,
} from './webhook-handler';
import type { WebhookHandler } from './webhook-handler';

function handlerFor(source: string): WebhookHandler {
  return { source, handle: () => Promise.resolve() };
}

describe('webhook handler registry', () => {
  afterEach(() => {
    clearWebhookHandlers();
  });

  it('returns only the handlers declared for a source', () => {
    const stripe = handlerFor('stripe');
    registerWebhookHandler(stripe);
    registerWebhookHandler(handlerFor('github'));

    expect(webhookHandlersFor('stripe')).toEqual([stripe]);
    expect(webhookHandlersFor('unknown')).toEqual([]);
  });

  it('registers one handler once even if its module initialises twice', () => {
    const stripe = handlerFor('stripe');
    registerWebhookHandler(stripe);
    registerWebhookHandler(stripe);

    expect(webhookHandlersFor('stripe')).toHaveLength(1);
  });
});
