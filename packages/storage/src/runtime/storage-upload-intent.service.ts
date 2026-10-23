import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CacheService } from '#kernel/public/platform';
import { TenantContextStorage } from '#kernel/public/tenancy';
import {
  EXTENSION_BY_CONTENT_TYPE,
  allowedContentTypes,
} from './storage.service';
import { storageEnv } from './storage.env';
import { StorageUploadIntentMismatchException } from './storage-upload-intent-mismatch.exception';
import { StorageUploadIntentNotFoundException } from './storage-upload-intent-not-found.exception';
import { StorageUploadRejectedException } from './storage-upload-rejected.exception';
import { StorageDriverRegistry } from './storage-driver.registry';

const INTENT_CACHE_PREFIX = 'upload-intent:';
const INTENT_TTL_SECONDS = 300;

export interface UploadIntentRequest {
  contentType: string;
  size: number;
}

export interface UploadIntent {
  key: string;
  url: string;
  headers?: Record<string, string>;
}

interface StoredIntent {
  contentType: string;
  size: number;
  tenantId: string;
}

@Injectable()
export class StorageUploadIntentService {
  constructor(
    private readonly drivers: StorageDriverRegistry,
    private readonly cache: CacheService,
  ) {}

  async create(request: UploadIntentRequest): Promise<UploadIntent> {
    if (!allowedContentTypes().includes(request.contentType)) {
      throw new StorageUploadRejectedException(
        `content type "${request.contentType}" is not allowed`,
      );
    }

    if (request.size > storageEnv.STORAGE_MAX_UPLOAD_BYTES) {
      throw new StorageUploadRejectedException(
        `declared size exceeds the ${storageEnv.STORAGE_MAX_UPLOAD_BYTES} byte limit`,
      );
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[request.contentType] ?? 'bin';
    const tenantId = TenantContextStorage.getTenantId();
    const key = `${tenantId}/${randomUUID()}.${extension}`;

    const presigned = await this.drivers.active.presignPut(
      key,
      request.contentType,
      request.size,
    );

    const intent: StoredIntent = {
      contentType: request.contentType,
      size: request.size,
      tenantId,
    };
    await this.cache.set(
      `${INTENT_CACHE_PREFIX}${key}`,
      intent,
      INTENT_TTL_SECONDS,
    );

    return { key, url: presigned.url, headers: presigned.headers };
  }

  async confirm(key: string): Promise<UploadIntent> {
    if (!key.startsWith(`${TenantContextStorage.getTenantId()}/`)) {
      throw new StorageUploadIntentNotFoundException(key);
    }

    const cacheKey = `${INTENT_CACHE_PREFIX}${key}`;
    const intent = await this.cache.take<StoredIntent>(cacheKey);

    if (!intent) {
      throw new StorageUploadIntentNotFoundException(key);
    }

    if (
      intent.tenantId !== TenantContextStorage.getTenantId() ||
      !key.startsWith(`${intent.tenantId}/`)
    ) {
      throw new StorageUploadIntentNotFoundException(key);
    }

    const stat = await this.drivers.active.stat(key);

    if (!stat) {
      throw new StorageUploadIntentMismatchException(
        'No object exists at the authorised key yet.',
        { key },
      );
    }

    if (stat.size !== intent.size) {
      throw new StorageUploadIntentMismatchException(
        'The uploaded object size does not match what was authorised.',
        { key, expectedSize: intent.size, actualSize: stat.size },
      );
    }

    if (stat.contentType !== intent.contentType) {
      throw new StorageUploadIntentMismatchException(
        'The uploaded object content type does not match what was authorised.',
        {
          key,
          expectedContentType: intent.contentType,
          actualContentType: stat.contentType,
        },
      );
    }

    const url = await this.drivers.active.signedUrl(key);
    return { key, url };
  }
}
