import { z } from 'zod';
import { devOnlyDefault, parseModuleEnv } from '#technical/config/module-env';

export const storageEnv = parseModuleEnv('storage', {
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
});

/**
 * Read when the S3 provider is constructed rather than when this file is
 * imported: these values only have to be real when STORAGE_DRIVER is s3, and an
 * application running on the local driver must not be refused a boot over
 * credentials it never uses.
 */
export function s3StorageEnv() {
  return parseModuleEnv('storage', {
    STORAGE_S3_BUCKET: z.string().min(1).default('heryjs'),
    STORAGE_S3_REGION: z.string().min(1).default('us-east-1'),
    STORAGE_S3_ENDPOINT: z.string().min(1).optional(),
    STORAGE_S3_ACCESS_KEY: devOnlyDefault('STORAGE_S3_ACCESS_KEY', 'heryjs'),
    STORAGE_S3_SECRET_KEY: devOnlyDefault(
      'STORAGE_S3_SECRET_KEY',
      'heryjs-dev-secret',
    ),
  });
}
