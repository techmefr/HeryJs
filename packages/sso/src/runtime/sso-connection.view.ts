import {
  verificationRecordName,
  verificationRecordValue,
} from './sso-domain-verifier';
import { samlAcsUri } from './sso-saml-uri';
import { certificateFingerprints } from './sso-saml-certificate';
import type {
  SsoAttributeMapping,
  SsoConnectionRecord,
  SsoLinkPolicy,
  SsoProtocol,
} from './sso.types';

export interface SsoDomainView {
  domain: string;
  isVerified: boolean;
  verifiedAt: Date | null;
  dnsRecord: { type: 'TXT'; name: string; value: string } | null;
}

export interface SsoSamlView {
  entryPoint: string | null;
  spEntityId: string;
  acsUrl: string;
  certificateFingerprints: string[];
  attributeMapping: SsoAttributeMapping | null;
}

export interface SsoConnectionView {
  id: string;
  name: string;
  protocol: SsoProtocol;
  issuer: string;
  clientId: string;
  hasClientSecret: boolean;
  saml: SsoSamlView | null;
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
    protocol: record.protocol,
    issuer: record.issuer,
    clientId: record.clientId,
    hasClientSecret: record.clientSecret !== null,
    saml:
      record.protocol === 'saml'
        ? {
            entryPoint: record.samlEntryPoint,
            spEntityId: record.clientId,
            acsUrl: samlAcsUri(redirectUri),
            certificateFingerprints: record.samlCertificate
              ? certificateFingerprints(record.samlCertificate)
              : [],
            attributeMapping: record.samlAttributeMapping,
          }
        : null,
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
