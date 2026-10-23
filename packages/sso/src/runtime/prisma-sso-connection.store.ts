import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authPrismaClient } from '#kernel/public/auth';
import { SSO_LINK_POLICIES, SSO_PROTOCOLS } from './sso.types';
import type {
  NewSsoConnection,
  SsoConnectionChanges,
  SsoConnectionStore,
} from './sso-connection.store';
import type {
  SsoConnectionRecord,
  SsoAttributeMapping,
  SsoDomainRecord,
  SsoLinkPolicy,
  SsoProtocol,
} from './sso.types';

const UNIQUE_VIOLATION = 'P2002';

interface ConnectionRow {
  id: string;
  tenantId: string;
  name: string;
  protocol: string;
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  samlEntryPoint: string | null;
  samlCertificate: string | null;
  samlAttributeMapping: string | null;
  linkPolicy: string;
  isEnabled: boolean;
  createdAt: Date;
  domains: SsoDomainRecord[];
}

const WITH_DOMAINS = {
  domains: {
    select: {
      id: true,
      domain: true,
      verificationToken: true,
      verifiedAt: true,
    },
    orderBy: { domain: 'asc' as const },
  },
};

function toLinkPolicy(value: string): SsoLinkPolicy {
  return SSO_LINK_POLICIES.find((policy) => policy === value) ?? 'refuse';
}

function toProtocol(value: string): SsoProtocol {
  return SSO_PROTOCOLS.find((protocol) => protocol === value) ?? 'oidc';
}

function toMapping(value: string | null): SsoAttributeMapping | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function toRecord(row: ConnectionRow): SsoConnectionRecord {
  return {
    ...row,
    protocol: toProtocol(row.protocol),
    samlAttributeMapping: toMapping(row.samlAttributeMapping),
    linkPolicy: toLinkPolicy(row.linkPolicy),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class PrismaSsoConnectionStore implements SsoConnectionStore {
  countByTenant(tenantId: string): Promise<number> {
    return authPrismaClient.ssoConnection.count({ where: { tenantId } });
  }

  async create(connection: NewSsoConnection): Promise<SsoConnectionRecord> {
    const row = await authPrismaClient.ssoConnection.create({
      data: {
        id: connection.id,
        tenantId: connection.tenantId,
        name: connection.name,
        protocol: connection.protocol,
        issuer: connection.issuer,
        clientId: connection.clientId,
        clientSecret: connection.sealedClientSecret,
        samlEntryPoint: connection.samlEntryPoint,
        samlCertificate: connection.samlCertificate,
        samlAttributeMapping: connection.samlAttributeMapping
          ? JSON.stringify(connection.samlAttributeMapping)
          : null,
        linkPolicy: connection.linkPolicy,
        domains: {
          create: connection.domains.map((entry) => ({
            tenantId: connection.tenantId,
            domain: entry.domain,
            verificationToken: entry.verificationToken,
          })),
        },
      },
      include: WITH_DOMAINS,
    });

    return toRecord(row);
  }

  async listByTenant(tenantId: string): Promise<SsoConnectionRecord[]> {
    const rows = await authPrismaClient.ssoConnection.findMany({
      where: { tenantId },
      include: WITH_DOMAINS,
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toRecord);
  }

  async findInTenant(
    tenantId: string,
    id: string,
  ): Promise<SsoConnectionRecord | null> {
    const row = await authPrismaClient.ssoConnection.findFirst({
      where: { id, tenantId },
      include: WITH_DOMAINS,
    });

    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<SsoConnectionRecord | null> {
    const row = await authPrismaClient.ssoConnection.findUnique({
      where: { id },
      include: WITH_DOMAINS,
    });

    return row ? toRecord(row) : null;
  }

  async findByVerifiedDomain(
    domain: string,
  ): Promise<SsoConnectionRecord | null> {
    const row = await authPrismaClient.ssoConnection.findFirst({
      where: { domains: { some: { domain, verifiedAt: { not: null } } } },
      include: WITH_DOMAINS,
    });

    return row ? toRecord(row) : null;
  }

  async update(
    tenantId: string,
    id: string,
    changes: SsoConnectionChanges,
  ): Promise<boolean> {
    const { sealedClientSecret, samlAttributeMapping, ...rest } = changes;
    const result = await authPrismaClient.ssoConnection.updateMany({
      where: { id, tenantId },
      data: {
        ...rest,
        ...(sealedClientSecret === undefined
          ? {}
          : { clientSecret: sealedClientSecret }),
        ...(samlAttributeMapping === undefined
          ? {}
          : { samlAttributeMapping: JSON.stringify(samlAttributeMapping) }),
      },
    });

    return result.count > 0;
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const result = await authPrismaClient.ssoConnection.deleteMany({
      where: { id, tenantId },
    });

    return result.count > 0;
  }

  async addDomain(
    tenantId: string,
    connectionId: string,
    domain: { domain: string; verificationToken: string },
  ): Promise<SsoDomainRecord | null> {
    try {
      return await authPrismaClient.ssoDomain.create({
        data: { tenantId, connectionId, ...domain },
        select: {
          id: true,
          domain: true,
          verificationToken: true,
          verifiedAt: true,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  async removeDomain(
    tenantId: string,
    connectionId: string,
    domain: string,
  ): Promise<boolean> {
    const result = await authPrismaClient.ssoDomain.deleteMany({
      where: { tenantId, connectionId, domain },
    });

    return result.count > 0;
  }

  async markDomainVerified(
    tenantId: string,
    connectionId: string,
    domain: string,
    verifiedAt: Date,
  ): Promise<boolean> {
    const isHeldElsewhere = await authPrismaClient.ssoDomain.findFirst({
      where: { domain, verifiedAt: { not: null }, NOT: { connectionId } },
      select: { id: true },
    });

    if (isHeldElsewhere) {
      return false;
    }

    try {
      const result = await authPrismaClient.ssoDomain.updateMany({
        where: { tenantId, connectionId, domain },
        data: { verifiedAt },
      });

      return result.count > 0;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }
}
