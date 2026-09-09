import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageController } from './storage.controller';
import { storageEnv } from './storage.env';
import { StorageSignatureGuard } from './storage-signature.guard';
import { StorageUploadController } from './storage-upload.controller';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER } from './storage.types';

const DRIVER = storageEnv.STORAGE_DRIVER;

// The upload route proxies bytes through this app for every driver -- S3 and
// MinIO still receive the object through StorageProvider.put(), the same
// gates apply either way -- but GET :key only exists for the local driver,
// which is the one this app itself has to serve back out.
@Module({
  imports: [AuthModule],
  controllers:
    DRIVER === 'local'
      ? [StorageController, StorageUploadController]
      : [StorageUploadController],
  providers: [
    LocalStorageProvider,
    StorageSignatureGuard,
    StorageService,
    {
      provide: STORAGE_PROVIDER,
      useClass: DRIVER === 's3' ? S3StorageProvider : LocalStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER, StorageService],
})
export class StorageModule {}
