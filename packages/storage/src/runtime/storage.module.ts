import { Module } from '@nestjs/common';
import { AuthModule } from '@heryjs/core/auth';
import { HeryConfigModule } from '@heryjs/core/config';
import { DriversModule, storageDriverToken } from '@heryjs/core/drivers';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import { StorageAdminController } from './storage-admin.controller';
import { StorageController } from './storage.controller';
import { StorageDriverRegistry } from './storage-driver.registry';
import { storageEnv } from './storage.env';
import { StorageSignatureGuard } from './storage-signature.guard';
import { StorageUploadController } from './storage-upload.controller';
import { StorageUploadIntentController } from './storage-upload-intent.controller';
import { StorageUploadIntentService } from './storage-upload-intent.service';
import { StorageService } from './storage.service';
import './storage.catalogue';
import { PrivacyModule } from '@heryjs/core/privacy';
import { StoragePersonalData } from './storage.personal-data';

const LOCAL_DRIVER_TOKEN = storageDriverToken('local');
const S3_DRIVER_TOKEN = storageDriverToken('s3');

// The upload route proxies bytes through this app for every driver -- any
// remote driver still receives the object through StorageDriver.put(), the
// same gates apply either way -- but GET :key only exists for the local
// driver, which is the one this app itself has to serve back out.
@Module({
  imports: [AuthModule, HeryConfigModule, DriversModule, PrivacyModule],
  controllers:
    storageEnv.STORAGE_DRIVER === 'local'
      ? [
          StorageController,
          StorageAdminController,
          StorageUploadController,
          StorageUploadIntentController,
        ]
      : [
          StorageAdminController,
          StorageUploadController,
          StorageUploadIntentController,
        ],
  providers: [
    LocalStorageDriver,
    S3StorageDriver,
    StorageDriverRegistry,
    StorageSignatureGuard,
    StorageService,
    StoragePersonalData,
    StorageUploadIntentService,
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
