import { Module } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageController } from './storage.controller';
import { StorageSignatureGuard } from './storage-signature.guard';
import { STORAGE_PROVIDER } from './storage.types';

const DRIVER = process.env.STORAGE_DRIVER ?? 'local';

@Module({
  controllers: DRIVER === 'local' ? [StorageController] : [],
  providers: [
    LocalStorageProvider,
    StorageSignatureGuard,
    {
      provide: STORAGE_PROVIDER,
      useClass: DRIVER === 's3' ? S3StorageProvider : LocalStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
