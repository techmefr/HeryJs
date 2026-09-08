import { Module } from '@nestjs/common';
import { MaintenanceGuard } from './maintenance.guard';

/**
 * The guard is provided but not registered globally here: a module that
 * installs itself as a global guard decides for the whole application from
 * inside a dependency. Registering it is a next step the developer performs in
 * their own app.module.ts, where they can read it.
 */
@Module({
  providers: [MaintenanceGuard],
  exports: [MaintenanceGuard],
})
export class MaintenanceModule {}
