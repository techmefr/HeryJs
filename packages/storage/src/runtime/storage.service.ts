import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { storageEnv } from './storage.env';
import { StorageUploadRejectedException } from './storage-upload-rejected.exception';
import { STORAGE_PROVIDER } from './storage.types';
import type { StorageProvider } from './storage.types';

const DEFAULT_ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
];

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface StoredFile {
  key: string;
  url: string;
}

function allowedContentTypes(): string[] {
  return storageEnv.STORAGE_ALLOWED_CONTENT_TYPES
    ? storageEnv.STORAGE_ALLOWED_CONTENT_TYPES.split(',').map((type) =>
        type.trim(),
      )
    : DEFAULT_ALLOWED_CONTENT_TYPES;
}

/**
 * The gates every project would otherwise write by hand: a size cap, a
 * content-type allowlist, and a key the caller never gets to name -- the
 * client's filename is read only to report an error, it is never part of
 * the stored key. The key is prefixed with the current tenant, the same
 * discipline CacheService applies to its own keys -- the raw provider still
 * leaves that to whoever calls .put() directly, but the gated upload path
 * has a request to read the tenant from, so it does not skip it.
 */
@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  async upload(file: UploadedFile): Promise<StoredFile> {
    if (!allowedContentTypes().includes(file.mimetype)) {
      throw new StorageUploadRejectedException(
        `content type "${file.mimetype}" is not allowed`,
      );
    }

    if (file.size > storageEnv.STORAGE_MAX_UPLOAD_BYTES) {
      throw new StorageUploadRejectedException(
        `file exceeds the ${storageEnv.STORAGE_MAX_UPLOAD_BYTES} byte limit`,
      );
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[file.mimetype] ?? 'bin';
    const tenantId = TenantContextStorage.getTenantId();
    const key = `${tenantId}/${randomUUID()}.${extension}`;

    await this.provider.put(key, file.buffer, file.mimetype);
    const url = await this.provider.signedUrl(key);

    return { key, url };
  }

  remove(key: string): Promise<void> {
    return this.provider.remove(key);
  }

  signedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.provider.signedUrl(key, expiresInSeconds);
  }
}
