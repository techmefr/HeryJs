import { SIGNATURE_SCHEME } from './outbound-webhook.constants';
import { computeSignature, verifyWebhookSignature } from './webhook-signature';

const SEPARATOR = ',';
const PREFIX = `${SIGNATURE_SCHEME}=`;

/**
 * The same HMAC the inbound side verifies, over `timestamp.body`, sent as one
 * `v1=<hex>` entry per secret that is currently valid. During a rotation that is
 * two entries, so a receiver still holding the old secret and one already on the
 * new one both find a signature they can check.
 */
export function signOutboundWebhook(
  secrets: readonly string[],
  timestamp: string,
  rawBody: Buffer,
): string {
  return secrets
    .map((secret) => `${PREFIX}${computeSignature(secret, timestamp, rawBody)}`)
    .join(SEPARATOR);
}

export interface OutboundSignatureInput {
  secret: string;
  header: string;
  timestamp: string;
  rawBody: Buffer;
  toleranceSeconds: number;
  now?: number;
}

/**
 * What a receiver runs. Shipped so the contract is executable rather than only
 * described, and so the specs hold the sender to it.
 */
export function verifyOutboundWebhook(input: OutboundSignatureInput): boolean {
  return input.header
    .split(SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(PREFIX))
    .some((entry) =>
      verifyWebhookSignature({
        secret: input.secret,
        timestamp: input.timestamp,
        rawBody: input.rawBody,
        signature: entry.slice(PREFIX.length),
        toleranceSeconds: input.toleranceSeconds,
        now: input.now,
      }),
    );
}
