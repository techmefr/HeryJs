import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { PRISMA_CLIENT } from '../prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../prisma/prisma.client';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  @Get()
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
