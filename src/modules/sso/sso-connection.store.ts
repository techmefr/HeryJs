import type {
  SsoConnectionRecord,
  SsoDomainRecord,
  SsoLinkPolicy,
  SsoProtocol,
} from './sso.types';

export const SSO_CONNECTION_STORE = Symbol('SSO_CONNECTION_STORE');

export interface NewSsoConnection {
  id: string;
  tenantId: string;
  name: string;
  protocol: SsoProtocol;
  issuer: string;
  clientId: string;
  sealedClientSecret: string | null;
  samlEntryPoint: string | null;
  samlCertificate: string | null;
  linkPolicy: SsoLinkPolicy;
  domains: Array<{ domain: string; verificationToken: string }>;
}

export interface SsoConnectionChanges {
  name?: string;
  issuer?: string;
  clientId?: string;
  sealedClientSecret?: string;
  samlEntryPoint?: string;
  samlCertificate?: string;
  linkPolicy?: SsoLinkPolicy;
  isEnabled?: boolean;
}

export interface SsoConnectionStore {
  countByTenant(tenantId: string): Promise<number>;
  create(connection: NewSsoConnection): Promise<SsoConnectionRecord>;
  listByTenant(tenantId: string): Promise<SsoConnectionRecord[]>;
  findInTenant(
    tenantId: string,
    id: string,
  ): Promise<SsoConnectionRecord | null>;
  findById(id: string): Promise<SsoConnectionRecord | null>;
  findByVerifiedDomain(domain: string): Promise<SsoConnectionRecord | null>;
  update(
    tenantId: string,
    id: string,
    changes: SsoConnectionChanges,
  ): Promise<boolean>;
  remove(tenantId: string, id: string): Promise<boolean>;
  addDomain(
    tenantId: string,
    connectionId: string,
    domain: { domain: string; verificationToken: string },
  ): Promise<SsoDomainRecord | null>;
  removeDomain(
    tenantId: string,
    connectionId: string,
    domain: string,
  ): Promise<boolean>;
  markDomainVerified(
    tenantId: string,
    connectionId: string,
    domain: string,
    verifiedAt: Date,
  ): Promise<boolean>;
}
