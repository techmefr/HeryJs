import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhook-signature';

const SECRET = 'a-secret-only-the-sender-has';
const TIMESTAMP = '1700000000000';
const BODY = Buffer.from('{"event":"invoice.paid"}');
const NOW = Number(TIMESTAMP) + 1000;

function sign(
  secret: string,
  timestamp: string,
  rawBody: Buffer = BODY,
): string {
  return createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex');
}

function verify(overrides: Record<string, unknown> = {}): boolean {
  return verifyWebhookSignature({
    secret: SECRET,
    timestamp: TIMESTAMP,
    rawBody: BODY,
    signature: sign(SECRET, TIMESTAMP),
    toleranceSeconds: 300,
    now: NOW,
    ...overrides,
  });
}

describe('verifying a webhook signature', () => {
  it('accepts a body signed with the endpoint secret', () => {
    expect(verify()).toBe(true);
  });

  it('refuses a signature made with another secret', () => {
    expect(verify({ signature: sign('not-the-secret', TIMESTAMP) })).toBe(
      false,
    );
  });

  // The signature covers the raw body, so this is the case the whole scheme
  // exists for: a body altered in transit no longer matches what was signed.
  it('refuses a body that changed after it was signed', () => {
    expect(verify({ rawBody: Buffer.from('{"event":"invoice.void"}') })).toBe(
      false,
    );
  });

  // Signed once, replayed later: without the window a captured request stays
  // valid forever, since the signature itself never expires.
  it('refuses a signature older than the tolerance', () => {
    expect(verify({ now: Number(TIMESTAMP) + 301_000 })).toBe(false);
  });

  it('refuses a timestamp in the future beyond the tolerance', () => {
    expect(verify({ now: Number(TIMESTAMP) - 301_000 })).toBe(false);
  });

  it('accepts one inside the tolerance on either side', () => {
    expect(verify({ now: Number(TIMESTAMP) + 299_000 })).toBe(true);
    expect(verify({ now: Number(TIMESTAMP) - 299_000 })).toBe(true);
  });

  // The timestamp is signed as the string it arrived as, so a caller can send
  // anything; a non-numeric one has to be rejected rather than compared, or
  // the age arithmetic silently yields NaN.
  it('refuses a timestamp that is not a number', () => {
    expect(
      verify({
        timestamp: 'yesterday',
        signature: sign(SECRET, 'yesterday'),
      }),
    ).toBe(false);
  });

  // timingSafeEqual throws on buffers of different lengths, so the comparison
  // has to be guarded before it is reached.
  it('refuses a signature of the wrong length without throwing', () => {
    expect(verify({ signature: 'abcd' })).toBe(false);
    expect(verify({ signature: '' })).toBe(false);
  });

  it('refuses a signature that is not hexadecimal', () => {
    expect(verify({ signature: 'z'.repeat(64) })).toBe(false);
  });
});
