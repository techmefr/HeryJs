import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { env } from '../config/env';
import type { StorageProvider } from './storage.types';

const ROOT = path.resolve(process.cwd(), 'storage');
const DEFAULT_TTL_SECONDS = 900;

// Zero-config default: files live on local disk, "signed URLs" are served
// by StorageController with an HMAC signature + expiry, the same trick
// already used for the signal SSE token (no header, so the signature
// travels in the query string). Swap STORAGE_PROVIDER for S3StorageProvider
// (or any S3-compatible endpoint, including a self-hosted MinIO) for
// anything beyond local dev.
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  async put(key: string, body: Buffer): Promise<void> {
    const target = path.join(ROOT, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async remove(key: string): Promise<void> {
    await rm(path.join(ROOT, key), { force: true });
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
    return readFile(path.join(ROOT, key));
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', env.SIGNAL_TOKEN_SECRET)
      .update(`${key}:${exp}`)
      .digest('base64url');
  }
}
