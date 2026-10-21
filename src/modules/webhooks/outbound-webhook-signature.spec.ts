import { createHmac } from 'node:crypto';
import {
  signOutboundWebhook,
  verifyOutboundWebhook,
} from './outbound-webhook-signature';

const OLD_SECRET = 'whsec_the-secret-before-the-rotation';
const NEW_SECRET = 'whsec_the-secret-after-the-rotation';
const TIMESTAMP = '1700000000000';
const BODY = Buffer.from('{"event":"webhook.invoice.paid"}');
const NOW = Number(TIMESTAMP) + 1000;

function receive(secret: string, header: string, overrides = {}): boolean {
  return verifyOutboundWebhook({
    secret,
    header,
    timestamp: TIMESTAMP,
    rawBody: BODY,
    toleranceSeconds: 300,
    now: NOW,
    ...overrides,
  });
}

describe('signing an outbound webhook', () => {
  it('signs the timestamp and the exact body with the same HMAC as the inbound side', () => {
    const expected = createHmac('sha256', NEW_SECRET)
      .update(TIMESTAMP)
      .update('.')
      .update(BODY)
      .digest('hex');

    expect(signOutboundWebhook([NEW_SECRET], TIMESTAMP, BODY)).toBe(
      `v1=${expected}`,
    );
  });

  it('carries one signature per valid secret, so both sides of a rotation verify', () => {
    const header = signOutboundWebhook(
      [NEW_SECRET, OLD_SECRET],
      TIMESTAMP,
      BODY,
    );

    expect(header.split(',')).toHaveLength(2);
    expect(receive(NEW_SECRET, header)).toBe(true);
    expect(receive(OLD_SECRET, header)).toBe(true);
  });

  it('is not verifiable with a secret that was not used', () => {
    const header = signOutboundWebhook([NEW_SECRET], TIMESTAMP, BODY);

    expect(receive(OLD_SECRET, header)).toBe(false);
  });

  it('refuses a body that was changed after signing', () => {
    const header = signOutboundWebhook([NEW_SECRET], TIMESTAMP, BODY);

    expect(
      receive(NEW_SECRET, header, { rawBody: Buffer.from('{"event":"x"}') }),
    ).toBe(false);
  });

  it('refuses a signature older than the tolerance window', () => {
    const header = signOutboundWebhook([NEW_SECRET], TIMESTAMP, BODY);

    expect(
      receive(NEW_SECRET, header, { now: Number(TIMESTAMP) + 10 * 60 * 1000 }),
    ).toBe(false);
  });

  it('ignores entries of a scheme it does not know', () => {
    const header = signOutboundWebhook([NEW_SECRET], TIMESTAMP, BODY);

    expect(receive(NEW_SECRET, `v2=abcd,${header}`)).toBe(true);
    expect(receive(NEW_SECRET, 'v2=abcd')).toBe(false);
  });
});
