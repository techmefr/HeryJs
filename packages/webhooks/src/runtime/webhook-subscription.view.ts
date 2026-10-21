import type { WebhookSubscription } from '@prisma/client';

export interface WebhookSubscriptionView {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  previousSecretExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The sealed secret never leaves the service: it is shown once, when it is
 * minted, and a lost one is replaced by rotating. What a reader can see of a
 * rotation is only whether the old secret is still being honoured.
 */
export function toSubscriptionView(
  row: WebhookSubscription,
  now: Date = new Date(),
): WebhookSubscriptionView {
  const isGraceOpen =
    row.previousSecret !== null &&
    row.previousSecretExpiresAt !== null &&
    row.previousSecretExpiresAt > now;

  return {
    id: row.id,
    url: row.url,
    description: row.description,
    events: row.events,
    active: row.active,
    previousSecretExpiresAt: isGraceOpen ? row.previousSecretExpiresAt : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
