import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { storageEnv } from './storage.env';
import { StorageUploadRejectedException } from './storage-upload-rejected.exception';
import { StorageNotInTenantException } from './storage-not-in-tenant.exception';
import { StorageDriverRegistry } from './storage-driver.registry';

const DEFAULT_ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
];

export const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
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

export interface ListedFile {
  key: string;
  size: number;
  url: string;
}

const LIST_LIMIT = 200;

const UNSAFE_SEGMENTS = new Set(['', '.', '..']);

export function allowedContentTypes(): string[] {
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
 * discipline CacheService applies to its own keys -- the raw driver still
 * leaves that to whoever calls .put() directly, but the gated upload path
 * has a request to read the tenant from, so it does not skip it.
 */
@Injectable()
export class StorageService {
  constructor(private readonly drivers: StorageDriverRegistry) {}

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

    await this.drivers.active.put(key, file.buffer, file.mimetype);
    const url = await this.drivers.active.signedUrl(key);

    return { key, url };
  }

  /**
   * The current tenant's files only: the prefix is the tenant id, the same one
   * `upload()` writes under, so one tenant's admin never lists another's keys.
   */
  async list(): Promise<ListedFile[]> {
    const driver = this.drivers.active;
    const objects = await driver.list(
      `${TenantContextStorage.getTenantId()}/`,
      LIST_LIMIT,
    );

    return Promise.all(
      objects.map(async (object) => ({
        ...object,
        url: await driver.signedUrl(object.key),
      })),
    );
  }

  /**
   * `remove()` takes any key, because export and import write their own. This
   * is the one an HTTP caller reaches, so it refuses a key outside the
   * caller's tenant instead of trusting the client to name its own.
   */
  async removeOwn(key: string): Promise<void> {
    const [tenant, ...rest] = key.split('/');

    if (
      tenant !== TenantContextStorage.getTenantId() ||
      rest.length === 0 ||
      rest.some((segment) => UNSAFE_SEGMENTS.has(segment))
    ) {
      throw new StorageNotInTenantException(key);
    }

    await this.drivers.active.remove(key);
  }

  remove(key: string): Promise<void> {
    return this.drivers.active.remove(key);
  }

  signedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.drivers.active.signedUrl(key, expiresInSeconds);
  }
}
