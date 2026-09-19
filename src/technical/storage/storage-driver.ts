/**
 * The storage half of the convention. Extracted from `src/modules/storage`'s
 * own types so that another module can write a file without importing the
 * storage module, which `.dependency-cruiser.cjs` forbids and should: a queued
 * export that imported storage directly would break the day storage was
 * uninstalled.
 *
 * Going through the token instead makes the dependency optional at runtime and
 * invisible at compile time -- export asks the resolver for a storage driver,
 * gets one if the project installed it, and degrades honestly if it did not.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const STORAGE_MODULE = 'storage';

export function storageDriverToken(driverName: string): symbol {
  return driverToken(STORAGE_MODULE, driverName);
}

export interface StoredObject {
  key: string;
  contentType: string;
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
