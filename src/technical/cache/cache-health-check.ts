import { Injectable, OnModuleInit } from '@nestjs/common';
import { HealthRegistry } from '#technical/health/health-registry';
import { CacheService } from './cache.service';

@Injectable()
export class CacheHealthCheck implements OnModuleInit {
  constructor(
    private readonly registry: HealthRegistry,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      name: 'cache',
      probes: ['readiness'],
      check: () => this.cache.ping(),
    });
  }
}
