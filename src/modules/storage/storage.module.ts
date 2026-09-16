import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import { StorageController } from './storage.controller';
import { StorageDriverRegistry } from './storage-driver.registry';
import { storageEnv } from './storage.env';
import { StorageSignatureGuard } from './storage-signature.guard';
import { StorageUploadController } from './storage-upload.controller';
import { StorageService } from './storage.service';
import { storageDriverToken } from '#technical/storage/storage-driver';

const LOCAL_DRIVER_TOKEN = storageDriverToken('local');
const S3_DRIVER_TOKEN = storageDriverToken('s3');

// The upload route proxies bytes through this app for every driver -- any
// remote driver still receives the object through StorageDriver.put(), the
// same gates apply either way -- but GET :key only exists for the local
// driver, which is the one this app itself has to serve back out.
@Module({
  imports: [AuthModule, HeryConfigModule, DriversModule],
  controllers:
    storageEnv.STORAGE_DRIVER === 'local'
      ? [StorageController, StorageUploadController]
      : [StorageUploadController],
  providers: [
    LocalStorageDriver,
    S3StorageDriver,
    StorageDriverRegistry,
    StorageSignatureGuard,
    StorageService,
    { provide: LOCAL_DRIVER_TOKEN, useExisting: LocalStorageDriver },
    // Bound here rather than shipped as its own package: the driver already
    // lives in this module and its SDK is already a dependency. Without the
    // binding, declaring `s3: { driver: 's3' }` in hery.config.ts stopped the
    // boot with "no module is installed to provide it" -- pointing at a
    // package that does not exist, for a driver sitting in this very folder.
    { provide: S3_DRIVER_TOKEN, useExisting: S3StorageDriver },
  ],
  exports: [StorageService, LOCAL_DRIVER_TOKEN, S3_DRIVER_TOKEN],
})
export class StorageModule {}
