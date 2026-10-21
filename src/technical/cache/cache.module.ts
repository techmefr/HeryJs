import { Global, Module } from '@nestjs/common';
import { HealthModule } from '#technical/health/health.module';
import { CacheHealthCheck } from './cache-health-check';
import { CacheService } from './cache.service';

// Global: the kernel itself is a consumer (the rate limiter reads through the
// same store), so every module reaching for a cache imports nothing extra.
@Global()
@Module({
  imports: [HealthModule],
  providers: [CacheService, CacheHealthCheck],
  exports: [CacheService],
})
export class CacheModule {}
