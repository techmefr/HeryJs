import { describe, expect, it } from 'vitest';
import {
  deliveriesRoute,
  parseEvents,
  statusTone,
  subscriptionBody,
} from './webhooks';

describe('parseEvents', () => {
  it('splits on commas and whitespace and drops duplicates and blanks', () => {
    expect(
      parseEvents('webhook.invoice.paid, model.*  webhook.invoice.paid,'),
    ).toEqual(['webhook.invoice.paid', 'model.*']);
  });

  it('answers an empty list for an empty line', () => {
    expect(parseEvents('  ')).toEqual([]);
  });
});

describe('subscriptionBody', () => {
  it('trims the url and leaves the description out when it is blank', () => {
    expect(
      subscriptionBody({
        url: ' https://a.test/in ',
        events: '*',
        description: ' ',
      }),
    ).toEqual({ url: 'https://a.test/in', events: ['*'] });
  });

  it('keeps a description that has text', () => {
    expect(
      subscriptionBody({
        url: 'https://a.test',
        events: 'model.*',
        description: 'CRM',
      }).description,
    ).toBe('CRM');
  });
});

describe('deliveriesRoute', () => {
  it('asks for a page, with a status only when one is chosen', () => {
    expect(deliveriesRoute(null, 2)).toBe(
      '/webhook-deliveries?page=2&limit=25',
    );
    expect(deliveriesRoute('dead', 1)).toBe(
      '/webhook-deliveries?page=1&limit=25&status=dead',
    );
  });
});

describe('statusTone', () => {
  it('colours delivered, pending and dead apart', () => {
    expect(statusTone('delivered')).toBe('ok');
    expect(statusTone('pending')).toBe('warn');
    expect(statusTone('dead')).toBe('danger');
  });
});
