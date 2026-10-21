import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SsoConnectionConflictException } from './sso-connection-conflict.exception';
import { SsoConnectionNotFoundException } from './sso-connection-not-found.exception';
import { SSO_CONNECTION_STORE } from './sso-connection.store';
import type {
  NewSsoConnection,
  SsoConnectionStore,
} from './sso-connection.store';
import { toConnectionView } from './sso-connection.view';
import type { SsoConnectionView } from './sso-connection.view';
import { SsoDiscoveryService } from './sso-discovery.service';
import { normalizeDomain } from './sso-domain';
import { SsoDomainVerifier } from './sso-domain-verifier';
import { parseIdpMetadata } from './sso-saml-metadata';
import type { SamlIdpMetadata } from './sso-saml-metadata';
import { normalizeCertificates } from './sso-saml-certificate';
import { SsoSecretService } from './sso-secret.service';
import { ssoEnv } from './sso.env';
import type {
  AddDomainInput,
  CreateConnectionInput,
  CreateOidcConnectionInput,
  CreateSamlConnectionInput,
  UpdateConnectionInput,
} from './sso.dto';
import { SSO_REDIRECT_URI } from './sso.types';
import type { SsoConnectionRecord, SsoLinkPolicy } from './sso.types';

export const MAX_CONNECTIONS_PER_TENANT = 10;
const VERIFICATION_TOKEN_BYTES = 24;
const SAML_ENTITY_PATH = '/sso/saml/';

type ProtocolFields = Pick<
  NewSsoConnection,
  | 'protocol'
  | 'issuer'
  | 'clientId'
  | 'sealedClientSecret'
  | 'samlEntryPoint'
  | 'samlCertificate'
  | 'samlAttributeMapping'
>;
type OidcFields = ProtocolFields;
type SamlFields = ProtocolFields;

function newVerificationToken(): string {
  return randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex');
}

@Injectable()
export class SsoConnectionService {
  constructor(
    @Inject(SSO_CONNECTION_STORE) private readonly store: SsoConnectionStore,
    @Inject(SSO_REDIRECT_URI) private readonly redirectUri: string,
    private readonly secrets: SsoSecretService,
    private readonly discovery: SsoDiscoveryService,
    private readonly verifier: SsoDomainVerifier,
  ) {}

  async create(
    tenantId: string,
    input: CreateConnectionInput,
  ): Promise<SsoConnectionView> {
    if (
      (await this.store.countByTenant(tenantId)) >= MAX_CONNECTIONS_PER_TENANT
    ) {
      throw new SsoConnectionConflictException('connection-limit');
    }

    const id = randomUUID();
    const protocolFields =
      input.protocol === 'saml'
        ? await this.samlFields(id, input)
        : await this.oidcFields(id, input);
    const domains = [
      ...new Set(input.domains.map((domain) => this.requireDomain(domain))),
    ];
    const record = await this.store.create({
      id,
      tenantId,
      name: input.name,
      linkPolicy: input.linkPolicy as SsoLinkPolicy,
      domains: domains.map((domain) => ({
        domain,
        verificationToken: newVerificationToken(),
      })),
      ...protocolFields,
    });

    return this.view(record);
  }

  async list(tenantId: string): Promise<SsoConnectionView[]> {
    const records = await this.store.listByTenant(tenantId);

    return records.map((record) => this.view(record));
  }

  async get(tenantId: string, id: string): Promise<SsoConnectionView> {
    return this.view(await this.require(tenantId, id));
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateConnectionInput,
  ): Promise<SsoConnectionView> {
    const existing = await this.require(tenantId, id);
    const {
      clientSecret,
      linkPolicy,
      entryPoint,
      certificate,
      issuer,
      metadataUrl,
      metadataXml,
      attributeMapping,
      ...rest
    } = input;
    const isSaml = existing.protocol === 'saml';
    const isMismatch = isSaml
      ? clientSecret !== undefined
      : issuer !== undefined ||
        entryPoint !== undefined ||
        certificate !== undefined ||
        metadataUrl !== undefined ||
        metadataXml !== undefined ||
        attributeMapping !== undefined;

    if (isMismatch) {
      throw new SsoConnectionConflictException('protocol-mismatch');
    }

    const imported = isSaml
      ? await this.importMetadata({ metadataUrl, metadataXml })
      : null;
    const nextIssuer = issuer ?? imported?.entityId;
    const nextEntryPoint = entryPoint ?? imported?.entryPoint;
    const nextCertificate = certificate ?? imported?.certificates.join('\n');

    await this.store.update(tenantId, id, {
      ...rest,
      ...(nextIssuer === undefined ? {} : { issuer: nextIssuer }),
      ...(attributeMapping === undefined
        ? {}
        : { samlAttributeMapping: attributeMapping }),
      ...(linkPolicy === undefined
        ? {}
        : { linkPolicy: linkPolicy as SsoLinkPolicy }),
      ...(clientSecret === undefined
        ? {}
        : { sealedClientSecret: this.secrets.seal(clientSecret, id) }),
      ...(nextEntryPoint === undefined
        ? {}
        : { samlEntryPoint: this.requireEntryPoint(nextEntryPoint) }),
      ...(nextCertificate === undefined
        ? {}
        : { samlCertificate: this.requireCertificate(nextCertificate) }),
    });

    return this.view(await this.require(tenantId, id));
  }

  async remove(tenantId: string, id: string): Promise<void> {
    if (!(await this.store.remove(tenantId, id))) {
      throw new SsoConnectionNotFoundException();
    }
  }

  async addDomain(
    tenantId: string,
    id: string,
    input: AddDomainInput,
  ): Promise<SsoConnectionView> {
    await this.require(tenantId, id);

    const added = await this.store.addDomain(tenantId, id, {
      domain: this.requireDomain(input.domain),
      verificationToken: newVerificationToken(),
    });

    if (!added) {
      throw new SsoConnectionConflictException('domain-claimed');
    }

    return this.view(await this.require(tenantId, id));
  }

  async removeDomain(
    tenantId: string,
    id: string,
    domain: string,
  ): Promise<SsoConnectionView> {
    await this.require(tenantId, id);

    if (!(await this.store.removeDomain(tenantId, id, domain.toLowerCase()))) {
      throw new SsoConnectionConflictException('domain-unknown');
    }

    return this.view(await this.require(tenantId, id));
  }

  async verifyDomain(
    tenantId: string,
    id: string,
    domain: string,
  ): Promise<SsoConnectionView> {
    const record = await this.require(tenantId, id);
    const name = domain.toLowerCase();
    const entry = record.domains.find((candidate) => candidate.domain === name);

    if (!entry) {
      throw new SsoConnectionConflictException('domain-unknown');
    }

    if (entry.verifiedAt) {
      return this.view(record);
    }

    if (
      !(await this.verifier.isProven(entry.domain, entry.verificationToken))
    ) {
      throw new SsoConnectionConflictException('domain-verification-failed');
    }

    const isMarked = await this.store.markDomainVerified(
      tenantId,
      id,
      name,
      new Date(),
    );

    if (!isMarked) {
      throw new SsoConnectionConflictException('domain-claimed');
    }

    return this.view(await this.require(tenantId, id));
  }

  private async require(
    tenantId: string,
    id: string,
  ): Promise<SsoConnectionRecord> {
    const record = await this.store.findInTenant(tenantId, id);

    if (!record) {
      throw new SsoConnectionNotFoundException();
    }

    return record;
  }

  private async oidcFields(
    id: string,
    input: CreateOidcConnectionInput,
  ): Promise<OidcFields> {
    await this.discovery.discover(input.issuer);

    return {
      protocol: 'oidc',
      issuer: input.issuer,
      clientId: input.clientId,
      sealedClientSecret: this.secrets.seal(input.clientSecret, id),
      samlEntryPoint: null,
      samlCertificate: null,
      samlAttributeMapping: null,
    };
  }

  private async samlFields(
    id: string,
    input: CreateSamlConnectionInput,
  ): Promise<SamlFields> {
    const imported = await this.importMetadata(input);
    const issuer = input.issuer ?? imported?.entityId;
    const entryPoint = input.entryPoint ?? imported?.entryPoint;
    const certificate = input.certificate ?? imported?.certificates.join('\n');

    if (!issuer || !entryPoint || !certificate) {
      throw new SsoConnectionConflictException('saml-incomplete');
    }

    return {
      protocol: 'saml',
      samlAttributeMapping: input.attributeMapping ?? null,
      issuer,
      clientId:
        input.spEntityId ??
        `${new URL(this.redirectUri).origin}${SAML_ENTITY_PATH}${id}`,
      sealedClientSecret: null,
      samlEntryPoint: this.requireEntryPoint(entryPoint),
      samlCertificate: this.requireCertificate(certificate),
    };
  }

  private async importMetadata(source: {
    metadataUrl?: string;
    metadataXml?: string;
  }): Promise<SamlIdpMetadata | null> {
    if (!source.metadataUrl && !source.metadataXml) {
      return null;
    }

    try {
      const xml =
        source.metadataXml ??
        (await this.discovery.fetchDocument(source.metadataUrl ?? ''));
      const metadata = parseIdpMetadata(xml);

      if (metadata) {
        return metadata;
      }
    } catch {
      // reported below as one refusal, whatever stopped the import
    }

    throw new SsoConnectionConflictException('saml-metadata-invalid');
  }

  private requireEntryPoint(value: string): string {
    const protocol = ((): string => {
      try {
        return new URL(value).protocol;
      } catch {
        return '';
      }
    })();
    const isSecure =
      protocol === 'https:' ||
      (protocol === 'http:' && ssoEnv.SSO_ALLOW_PRIVATE_ISSUERS);

    if (!isSecure) {
      throw new SsoConnectionConflictException('saml-entry-point-insecure');
    }

    return value;
  }

  private requireCertificate(value: string): string {
    const bundle = normalizeCertificates(value);

    if (!bundle) {
      throw new SsoConnectionConflictException('saml-certificate-invalid');
    }

    return bundle;
  }

  private requireDomain(value: string): string {
    const domain = normalizeDomain(value);

    if (!domain) {
      throw new SsoConnectionConflictException('domain-invalid');
    }

    return domain;
  }

  private view(record: SsoConnectionRecord): SsoConnectionView {
    return toConnectionView(record, this.redirectUri);
  }
}
