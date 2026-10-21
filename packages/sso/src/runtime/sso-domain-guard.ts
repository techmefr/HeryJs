import { domainOfEmail } from './sso-domain';
import { SsoRefusedException } from './sso-refused.exception';
import type { SsoConnectionRecord } from './sso.types';

/**
 * An identity provider is trusted for the email domains its tenant proved with
 * a DNS record, and for no others: whatever protocol carried the identity, an
 * address outside those domains is refused before anything is provisioned.
 */
export function assertVerifiedEmailDomain(
  connection: SsoConnectionRecord,
  email: string,
): void {
  const domain = domainOfEmail(email);
  const isVerified = connection.domains.some(
    (entry) => entry.verifiedAt !== null && entry.domain === domain,
  );

  if (!isVerified) {
    throw new SsoRefusedException('email-domain-not-verified');
  }
}
