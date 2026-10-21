import {
  Global,
  Inject,
  Injectable,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { HealthRegistry } from './health-registry';

@Injectable()
class CoreHealthChecks implements OnModuleInit {
  constructor(
    private readonly registry: HealthRegistry,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      name: 'process',
      probes: ['liveness'],
      check: async () => undefined,
    });

    this.registry.register({
      name: 'database',
      probes: ['readiness'],
      check: async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      },
    });
  }
}

@Global()
@Module({
  imports: [PrismaModule],
  providers: [HealthRegistry, CoreHealthChecks],
  exports: [HealthRegistry],
})
export class HealthModule {}
