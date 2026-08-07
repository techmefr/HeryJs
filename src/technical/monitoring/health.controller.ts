import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import IORedis from 'ioredis';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { env } from '#technical/config/env';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { canReadHealth } from './monitoring.policy';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';

/**
 * The report names the database and the queue and quotes their failures
 * verbatim, so it is a caller-authenticated route like any other. A container
 * or cluster probe carries an API key for it, the same way a metrics scrape
 * does -- see the health check in docker-compose.yml.
 */
@Controller('health')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  @UnpaginatedRoute('one object, not a collection')
  @Get()
  @Capability(canReadHealth)
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkRedis(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch (error) {
      throw new HealthCheckError('Database check failed', {
        database: { status: 'down', message: (error as Error).message },
      });
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const client = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    try {
      await client.connect();
      await client.ping();
      return { redis: { status: 'up' } };
    } catch (error) {
      throw new HealthCheckError('Redis check failed', {
        redis: { status: 'down', message: (error as Error).message },
      });
    } finally {
      client.disconnect();
    }
  }
}
