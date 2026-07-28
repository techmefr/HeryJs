import { Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createTenantScopedPrismaClient, PRISMA_CLIENT } from './prisma.client';
import type { TenantScopedPrismaClient } from './prisma.client';

class PrismaLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly client: TenantScopedPrismaClient,
  ) {}

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: createTenantScopedPrismaClient,
    },
    PrismaLifecycle,
  ],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
