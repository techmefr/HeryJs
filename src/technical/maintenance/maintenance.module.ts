import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { env } from '#technical/config/env';
import { MaintenanceMiddleware } from './maintenance.middleware';
import { MaintenanceStore } from './maintenance-store';

@Global()
@Module({
  providers: [
    {
      provide: MaintenanceStore,
      useFactory: () => new MaintenanceStore(env.REDIS_URL),
    },
    MaintenanceMiddleware,
  ],
  exports: [MaintenanceStore, MaintenanceMiddleware],
})
export class MaintenanceModule implements OnModuleDestroy {
  constructor(
    @Inject(MaintenanceStore) private readonly store: MaintenanceStore,
  ) {}

  onModuleDestroy(): void {
    this.store.close();
  }
}
