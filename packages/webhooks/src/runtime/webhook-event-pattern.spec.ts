import {
  isDeliverablePattern,
  matchesEventPattern,
} from './webhook-event-pattern';

describe('matching a webhook subscription to an event', () => {
  it.each([
    ['webhook.invoice.paid', 'webhook.invoice.paid'],
    ['webhook.invoice.*', 'webhook.invoice.paid'],
    ['webhook.*', 'webhook.invoice.paid'],
    ['model.*', 'model.created'],
    ['model.created', 'model.created'],
    ['*', 'webhook.anything'],
    ['*', 'model.deleted'],
  ])('matches %s against %s', (pattern, name) => {
    expect(matchesEventPattern(pattern, name)).toBe(true);
  });

  it.each([
    ['webhook.invoice.paid', 'webhook.invoice.refunded'],
    ['webhook.invoice.*', 'webhook.customer.created'],
    ['model.created', 'model.updated'],
  ])('does not match %s against %s', (pattern, name) => {
    expect(matchesEventPattern(pattern, name)).toBe(false);
  });

  it('never delivers a message that was not staged for customers, whatever the pattern', () => {
    expect(matchesEventPattern('*', 'event:InvoicePaid')).toBe(false);
    expect(matchesEventPattern('event:*', 'event:InvoicePaid')).toBe(false);
    expect(matchesEventPattern('*', 'outbox.relay')).toBe(false);
  });
});

describe('accepting a subscription pattern', () => {
  it.each([
    '*',
    'webhook.*',
    'webhook.invoice.paid',
    'model.*',
    'model.created',
    'web*',
    'mod*',
  ])('accepts %s', (pattern) => {
    expect(isDeliverablePattern(pattern)).toBe(true);
  });

  it.each(['event:*', 'event:InvoicePaid', 'invoice.paid', 'billing.*', 'x*'])(
    'refuses %s, which could never match a deliverable event',
    (pattern) => {
      expect(isDeliverablePattern(pattern)).toBe(false);
    },
  );
});
