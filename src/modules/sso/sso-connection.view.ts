import {
  verificationRecordName,
  verificationRecordValue,
} from './sso-domain-verifier';
import type { SsoConnectionRecord, SsoLinkPolicy } from './sso.types';

export interface SsoDomainView {
  domain: string;
  isVerified: boolean;
  verifiedAt: Date | null;
  dnsRecord: { type: 'TXT'; name: string; value: string } | null;
}

export interface SsoConnectionView {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  hasClientSecret: true;
  linkPolicy: SsoLinkPolicy;
  isEnabled: boolean;
  createdAt: Date;
  redirectUri: string;
  domains: SsoDomainView[];
}

export function toConnectionView(
  record: SsoConnectionRecord,
  redirectUri: string,
): SsoConnectionView {
  return {
    id: record.id,
    name: record.name,
    issuer: record.issuer,
    clientId: record.clientId,
    hasClientSecret: true,
    linkPolicy: record.linkPolicy,
    isEnabled: record.isEnabled,
    createdAt: record.createdAt,
    redirectUri,
    domains: record.domains.map((domain) => ({
      domain: domain.domain,
      isVerified: domain.verifiedAt !== null,
      verifiedAt: domain.verifiedAt,
      dnsRecord:
        domain.verifiedAt === null
          ? {
              type: 'TXT',
              name: verificationRecordName(domain.domain),
              value: verificationRecordValue(domain.verificationToken),
            }
          : null,
    })),
  };
}
