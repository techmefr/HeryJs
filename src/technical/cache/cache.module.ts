import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

// Global: the kernel itself is a consumer (the rate limiter reads through the
// same store), so every module reaching for a cache imports nothing extra.
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
