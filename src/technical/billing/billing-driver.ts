/**
 * The billing half of the module-and-driver convention. Contract and token in
 * the kernel, drivers as packages -- the same shape mail, sms and push take.
 *
 * Scoped deliberately narrow: this is the *ingestion* half. A driver turns an
 * inbound webhook into the handful of facts this module mirrors locally; it
 * does not create a checkout session, change a plan or issue a refund. Those
 * are outbound calls to the provider's own API, and they carry the product
 * decisions the research behind this module named as unresolved -- proration,
 * what a failed payment does mid-grace-period. Bundling them into the same
 * contract as "verify this webhook" would have shipped an opinion on those
 * questions by accident, buried inside a driver's shape.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const BILLING_MODULE = 'billing';

export function billingDriverToken(driverName: string): symbol {
  return driverToken(BILLING_MODULE, driverName);
}

/**
 * The five states every provider's richer status enum collapses into. `active`
 * and `trialing` grant quota by default; the other three do not, unless a
 * caller explicitly widens what it accepts -- see BillingService.
 */
export type BillingSubscriptionStatus =
  'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

/**
 * What a webhook event becomes once verified and parsed. `tenantId` is
 * resolved from the provider's own metadata on the subscription or customer
 * object -- which means the app has to have attached it at checkout time, a
 * precondition this module cannot enforce and states loudly instead of
 * silently assuming.
 */
export interface BillingEvent {
  /**
   * Which provider this came from, named by the driver rather than assumed by
   * the mirror -- the mirror keys its rows on (provider, subscriptionId), and
   * a hardcoded provider name there would misfile a second provider's events
   * under the first one's.
   */
  provider: string;
  subscriptionId: string;
  tenantId: string;
  plan: string;
  status: BillingSubscriptionStatus;
  currentPeriodEnd: Date;
}

export class BillingWebhookSignatureException extends Error {
  constructor() {
    super('The billing webhook signature could not be verified.');
  }
}

/**
 * A raw payload the driver could not resolve a tenant for -- the precondition
 * above, violated. Thrown rather than silently dropped: a subscription this
 * module cannot attribute to a tenant is not one it can safely mirror, and
 * dropping it quietly would mean a paying customer's subscription state never
 * reaches the app that is supposed to enforce it.
 */
export class BillingEventUnattributedException extends Error {
  constructor(providerEventType: string) {
    super(
      `A "${providerEventType}" event carried no tenant id in its metadata. Attach tenantId as metadata when creating the subscription or customer.`,
    );
  }
}

export interface BillingDriver {
  /**
   * Verifies the signature and turns the provider's payload into the events
   * this module understands. Throws BillingWebhookSignatureException on a bad
   * signature and BillingEventUnattributedException on one that cannot be
   * attributed to a tenant.
   *
   * An empty array, not an error, for an event type nothing here mirrors --
   * providers add event types over time, and treating every unknown one as a
   * failure would make an upstream addition break every existing install.
   */
  parseWebhook(rawBody: Buffer, signatureHeader: string): BillingEvent[];
}
