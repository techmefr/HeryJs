import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { env } from '#kernel/config/env';
import { InvalidStorageKeyException } from './invalid-storage-key.exception';
import { StorageBodyTooLargeException } from './storage-body-too-large.exception';
import type { StorageProvider } from './storage.types';

const ROOT = path.resolve(process.cwd(), 'storage');
const DEFAULT_TTL_SECONDS = 900;
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

function metaPath(target: string): string {
  return `${target}.meta.json`;
}

/**
 * A key names a location inside ROOT and nothing else. `path.join` walks out of
 * the root without complaint on a key containing `../`, and this module's own
 * instructions tell developers to inject the provider and pass keys straight in,
 * so refusing the escape belongs here rather than in every call site.
 */
function insideRoot(key: string): string {
  const target = path.resolve(ROOT, key);

  if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
    throw new InvalidStorageKeyException(key);
  }

  return target;
}

// Zero-config default: files live on local disk, "signed URLs" are served
// by StorageController with an HMAC signature + expiry, the same trick
// already used for the signal SSE token (no header, so the signature
// travels in the query string). Swap STORAGE_PROVIDER for S3StorageProvider
// (or any S3-compatible endpoint, including a self-hosted MinIO) for
// anything beyond local dev.
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (body.byteLength > MAX_BODY_BYTES) {
      throw new StorageBodyTooLargeException(body.byteLength, MAX_BODY_BYTES);
    }

    const target = insideRoot(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    await writeFile(metaPath(target), JSON.stringify({ contentType }));
  }

  async remove(key: string): Promise<void> {
    const target = insideRoot(key);
    await rm(target, { force: true });
    await rm(metaPath(target), { force: true });
  }

  // The controller serves this file's bytes directly (S3/MinIO never proxy
  // through this app, they serve their own signed URL) -- without the
  // stored content type, the browser is left to sniff the response and will
  // happily execute an uploaded HTML/SVG file as same-origin markup.
  async contentTypeOf(key: string): Promise<string> {
    try {
      const raw = await readFile(metaPath(insideRoot(key)), 'utf8');
      const contentType = (JSON.parse(raw) as { contentType?: unknown })
        .contentType;
      return typeof contentType === 'string'
        ? contentType
        : DEFAULT_CONTENT_TYPE;
    } catch {
      return DEFAULT_CONTENT_TYPE;
    }
  }

  signedUrl(
    key: string,
    expiresInSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    const exp = Date.now() + expiresInSeconds * 1000;
    const signature = this.sign(key, exp);
    return Promise.resolve(
      `/storage/${encodeURIComponent(key)}?exp=${exp}&sig=${signature}`,
    );
  }

  verify(key: string, exp: number, signature: string): boolean {
    if (Date.now() > exp) {
      return false;
    }

    const expected = Buffer.from(this.sign(key, exp));
    const provided = Buffer.from(signature);

    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  }

  async read(key: string): Promise<Buffer> {
    return readFile(insideRoot(key));
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', env.STORAGE_URL_SECRET)
      .update(`${key}:${exp}`)
      .digest('base64url');
  }
}
