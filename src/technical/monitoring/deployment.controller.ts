import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { HealthRegistry } from '#technical/health/health-registry';
import type { HealthReport } from '#technical/health/health-check';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { isEnvSet } from '#technical/config/module-env';
import { canReadDeployment } from './monitoring.policy';

/**
 * What a production boot refuses to start without. Listed by name, never by
 * value: the answer says whether each one is set, so an operator can see a
 * missing secret without the dashboard becoming a place secrets leak from.
 */
export const REQUIRED_PRODUCTION_VARIABLES = [
  'DATABASE_URL',
  'REDIS_URL',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_SECRET',
  'SIGNAL_TOKEN_SECRET',
  'SSE_TOKEN_SECRET',
  'OAUTH_STATE_SECRET',
  'STORAGE_URL_SECRET',
  'SECRETS_KEYS',
  'SSO_STATE_SECRET',
  'SSO_SECRET_KEY',
  'SSO_REDIRECT_BASE_URL',
  'OAUTH_REDIRECT_BASE_URL',
  'STORAGE_S3_ACCESS_KEY',
  'STORAGE_S3_SECRET_KEY',
];

export interface DeploymentStatus {
  version: string | null;
  nodeEnv: string;
  environment: { name: string; isSet: boolean }[];
  health: HealthReport;
  migrations: { applied: number; pending: number | null };
}

@Controller('deployment')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class DeploymentController {
  constructor(
    private readonly registry: HealthRegistry,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  @UnpaginatedRoute('one object, not a collection')
  @RateLimit('read')
  @Get()
  @Capability(canReadDeployment)
  async status(): Promise<DeploymentStatus> {
    return {
      version: this.version(),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      environment: REQUIRED_PRODUCTION_VARIABLES.map((name) => ({
        name,
        isSet: isEnvSet(name),
      })),
      health: await this.registry.report('readiness'),
      migrations: await this.migrations(),
    };
  }

  private version(): string | null {
    try {
      const manifest = JSON.parse(
        readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
      ) as { version?: string };

      return manifest.version ?? null;
    } catch {
      return null;
    }
  }

  // Applied rows only: whether the folder on disk holds more is a question for
  // the migrate job, which is the one place that sees both.
  private async migrations(): Promise<DeploymentStatus['migrations']> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const pending = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL`;

    return {
      applied: Number(rows[0]?.count ?? 0),
      pending: Number(pending[0]?.count ?? 0),
    };
  }
}
