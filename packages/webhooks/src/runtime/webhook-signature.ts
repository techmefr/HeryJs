import { createHmac, timingSafeEqual } from 'node:crypto';

function computeSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
): string {
  return createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex');
}

export interface WebhookSignatureInput {
  secret: string;
  timestamp: string;
  rawBody: Buffer;
  signature: string;
  toleranceSeconds: number;
  now?: number;
}

export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  const timestampMs = Number(input.timestamp);

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const now = input.now ?? Date.now();
  const ageSeconds = Math.abs(now - timestampMs) / 1000;

  if (ageSeconds > input.toleranceSeconds) {
    return false;
  }

  const expected = computeSignature(
    input.secret,
    input.timestamp,
    input.rawBody,
  );
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(input.signature, 'hex');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
