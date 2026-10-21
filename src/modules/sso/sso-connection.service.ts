import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SsoConnectionConflictException } from './sso-connection-conflict.exception';
import { SsoConnectionNotFoundException } from './sso-connection-not-found.exception';
import { SSO_CONNECTION_STORE } from './sso-connection.store';
import type { SsoConnectionStore } from './sso-connection.store';
import { toConnectionView } from './sso-connection.view';
import type { SsoConnectionView } from './sso-connection.view';
import { SsoDiscoveryService } from './sso-discovery.service';
import { normalizeDomain } from './sso-domain';
import { SsoDomainVerifier } from './sso-domain-verifier';
import { SsoSecretService } from './sso-secret.service';
import type {
  AddDomainInput,
  CreateConnectionInput,
  UpdateConnectionInput,
} from './sso.dto';
import { SSO_REDIRECT_URI } from './sso.types';
import type { SsoConnectionRecord, SsoLinkPolicy } from './sso.types';

export const MAX_CONNECTIONS_PER_TENANT = 10;
const VERIFICATION_TOKEN_BYTES = 24;

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

    await this.discovery.discover(input.issuer);

    const id = randomUUID();
    const domains = [
      ...new Set(input.domains.map((domain) => this.requireDomain(domain))),
    ];
    const record = await this.store.create({
      id,
      tenantId,
      name: input.name,
      issuer: input.issuer,
      clientId: input.clientId,
      sealedClientSecret: this.secrets.seal(input.clientSecret, id),
      linkPolicy: input.linkPolicy as SsoLinkPolicy,
      domains: domains.map((domain) => ({
        domain,
        verificationToken: newVerificationToken(),
      })),
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
    await this.require(tenantId, id);

    const { clientSecret, linkPolicy, ...rest } = input;

    await this.store.update(tenantId, id, {
      ...rest,
      ...(linkPolicy === undefined
        ? {}
        : { linkPolicy: linkPolicy as SsoLinkPolicy }),
      ...(clientSecret === undefined
        ? {}
        : { sealedClientSecret: this.secrets.seal(clientSecret, id) }),
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
