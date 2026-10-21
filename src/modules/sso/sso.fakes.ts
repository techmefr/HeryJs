import type {
  NewSsoConnection,
  SsoConnectionChanges,
  SsoConnectionStore,
} from './sso-connection.store';
import type {
  SsoIdentityStore,
  SsoLocalUser,
  SsoNewUser,
} from './sso-identity.store';
import type { SsoConnectionRecord, SsoDomainRecord } from './sso.types';

export class InMemorySsoConnectionStore implements SsoConnectionStore {
  readonly rows: SsoConnectionRecord[] = [];

  countByTenant(tenantId: string): Promise<number> {
    return Promise.resolve(
      this.rows.filter((row) => row.tenantId === tenantId).length,
    );
  }

  create(connection: NewSsoConnection): Promise<SsoConnectionRecord> {
    const record: SsoConnectionRecord = {
      id: connection.id,
      tenantId: connection.tenantId,
      name: connection.name,
      protocol: connection.protocol,
      issuer: connection.issuer,
      clientId: connection.clientId,
      clientSecret: connection.sealedClientSecret,
      samlEntryPoint: connection.samlEntryPoint,
      samlCertificate: connection.samlCertificate,
      linkPolicy: connection.linkPolicy,
      isEnabled: true,
      createdAt: new Date(),
      domains: connection.domains.map((entry, index) => ({
        id: `${connection.id}-${index}`,
        domain: entry.domain,
        verificationToken: entry.verificationToken,
        verifiedAt: null,
      })),
    };

    this.rows.push(record);

    return Promise.resolve(record);
  }

  listByTenant(tenantId: string): Promise<SsoConnectionRecord[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.tenantId === tenantId),
    );
  }

  findInTenant(
    tenantId: string,
    id: string,
  ): Promise<SsoConnectionRecord | null> {
    return Promise.resolve(
      this.rows.find((row) => row.id === id && row.tenantId === tenantId) ??
        null,
    );
  }

  findById(id: string): Promise<SsoConnectionRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  findByVerifiedDomain(domain: string): Promise<SsoConnectionRecord | null> {
    return Promise.resolve(
      this.rows.find((row) =>
        row.domains.some(
          (entry) => entry.domain === domain && entry.verifiedAt !== null,
        ),
      ) ?? null,
    );
  }

  async update(
    tenantId: string,
    id: string,
    changes: SsoConnectionChanges,
  ): Promise<boolean> {
    const row = await this.findInTenant(tenantId, id);

    if (!row) {
      return false;
    }

    const { sealedClientSecret, ...rest } = changes;

    Object.assign(row, rest);

    if (sealedClientSecret !== undefined) {
      row.clientSecret = sealedClientSecret;
    }

    return true;
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const row = await this.findInTenant(tenantId, id);

    if (!row) {
      return false;
    }

    this.rows.splice(this.rows.indexOf(row), 1);

    return true;
  }

  async addDomain(
    tenantId: string,
    connectionId: string,
    domain: { domain: string; verificationToken: string },
  ): Promise<SsoDomainRecord | null> {
    const row = await this.findInTenant(tenantId, connectionId);

    if (!row || row.domains.some((entry) => entry.domain === domain.domain)) {
      return null;
    }

    const added: SsoDomainRecord = {
      id: `${connectionId}-${row.domains.length}`,
      ...domain,
      verifiedAt: null,
    };

    row.domains.push(added);

    return added;
  }

  async removeDomain(
    tenantId: string,
    connectionId: string,
    domain: string,
  ): Promise<boolean> {
    const row = await this.findInTenant(tenantId, connectionId);
    const index = row
      ? row.domains.findIndex((entry) => entry.domain === domain)
      : -1;

    if (!row || index === -1) {
      return false;
    }

    row.domains.splice(index, 1);

    return true;
  }

  async markDomainVerified(
    tenantId: string,
    connectionId: string,
    domain: string,
    verifiedAt: Date,
  ): Promise<boolean> {
    const isTaken = this.rows.some((row) =>
      row.domains.some(
        (entry) => entry.domain === domain && entry.verifiedAt !== null,
      ),
    );
    const row = await this.findInTenant(tenantId, connectionId);
    const entry = row?.domains.find((candidate) => candidate.domain === domain);

    if (isTaken || !entry) {
      return false;
    }

    entry.verifiedAt = verifiedAt;

    return true;
  }
}

export class InMemorySsoIdentityStore implements SsoIdentityStore {
  readonly users: SsoLocalUser[] = [];
  readonly identities: Array<{
    connectionId: string;
    subject: string;
    userId: string;
  }> = [];

  findLinkedUserId(
    connectionId: string,
    subject: string,
  ): Promise<string | null> {
    const identity = this.identities.find(
      (entry) =>
        entry.connectionId === connectionId && entry.subject === subject,
    );

    return Promise.resolve(identity ? identity.userId : null);
  }

  findUser(id: string): Promise<SsoLocalUser | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  findUserByEmail(email: string): Promise<SsoLocalUser | null> {
    return Promise.resolve(
      this.users.find(
        (user) => user.email.toLowerCase() === email.toLowerCase(),
      ) ?? null,
    );
  }

  async createUser(user: SsoNewUser): Promise<SsoLocalUser | null> {
    if (await this.findUserByEmail(user.email)) {
      return null;
    }

    const created: SsoLocalUser = {
      id: `user-${this.users.length + 1}`,
      tenantId: user.tenantId,
      email: user.email.toLowerCase(),
      isEmailVerified: true,
      isBanned: false,
    };

    this.users.push(created);

    return created;
  }

  async linkIdentity(
    _tenantId: string,
    connectionId: string,
    subject: string,
    userId: string,
  ): Promise<boolean> {
    if (await this.findLinkedUserId(connectionId, subject)) {
      return false;
    }

    this.identities.push({ connectionId, subject, userId });

    return true;
  }

  removeIdentity(connectionId: string, subject: string): Promise<void> {
    const index = this.identities.findIndex(
      (entry) =>
        entry.connectionId === connectionId && entry.subject === subject,
    );

    if (index !== -1) {
      this.identities.splice(index, 1);
    }

    return Promise.resolve();
  }
}

export function connectionRecord(
  overrides: Partial<SsoConnectionRecord> = {},
): SsoConnectionRecord {
  return {
    id: 'conn-1',
    tenantId: 'acme',
    name: 'Acme Okta',
    protocol: 'oidc',
    issuer: 'https://idp.acme.test',
    clientId: 'client-1',
    clientSecret: 'sealed',
    samlEntryPoint: null,
    samlCertificate: null,
    linkPolicy: 'refuse',
    isEnabled: true,
    createdAt: new Date('2026-10-22T00:00:00Z'),
    domains: [
      {
        id: 'dom-1',
        domain: 'acme.test',
        verificationToken: 'token-1',
        verifiedAt: new Date('2026-10-22T00:00:00Z'),
      },
    ],
    ...overrides,
  };
}
