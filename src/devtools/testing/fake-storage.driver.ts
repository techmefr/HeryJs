import type {
  PresignedUpload,
  StorageDriver,
  StoredObject,
  StoredObjectStat,
  StoredObjectSummary,
} from '#technical/storage/storage-driver';
import { FakeAssertionError } from './fake-assertion.error';
import { FakeStorageObjectNotFoundException } from './fake-storage-object-not-found.exception';
import { RecordingFake } from './recording-fake';
import type { RecordPredicate } from './recording-fake';

export interface RecordedStorageOperation {
  operation: 'put' | 'remove';
  key: string;
}

interface HeldObject {
  body: Buffer;
  contentType: string;
}

const FAKE_URL_BASE = 'https://storage.fake.test';

export class FakeStorageDriver
  extends RecordingFake<RecordedStorageOperation>
  implements StorageDriver
{
  protected readonly label = 'a storage operation';

  private readonly objects = new Map<string, HeldObject>();

  get keys(): string[] {
    return [...this.objects.keys()];
  }

  override reset(): void {
    super.reset();
    this.objects.clear();
  }

  put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { body, contentType });
    this.record({ operation: 'put', key });

    return Promise.resolve({ key, contentType });
  }

  get(key: string): Promise<Buffer> {
    const held = this.objects.get(key);

    if (!held) {
      return Promise.reject(new FakeStorageObjectNotFoundException(key));
    }

    return Promise.resolve(held.body);
  }

  remove(key: string): Promise<void> {
    this.objects.delete(key);
    this.record({ operation: 'remove', key });

    return Promise.resolve();
  }

  signedUrl(key: string): Promise<string> {
    return Promise.resolve(`${FAKE_URL_BASE}/${key}`);
  }

  presignPut(key: string): Promise<PresignedUpload> {
    return Promise.resolve({ url: `${FAKE_URL_BASE}/upload/${key}` });
  }

  stat(key: string): Promise<StoredObjectStat | null> {
    const held = this.objects.get(key);

    return Promise.resolve(
      held ? { size: held.body.length, contentType: held.contentType } : null,
    );
  }

  list(prefix: string, limit: number): Promise<StoredObjectSummary[]> {
    return Promise.resolve(
      [...this.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .slice(0, limit)
        .map(([key, held]) => ({ key, size: held.body.length })),
    );
  }

  assertStored(key?: string): void {
    const isStored =
      key === undefined ? this.objects.size > 0 : this.objects.has(key);

    if (isStored) {
      return;
    }

    throw new FakeAssertionError(
      `Expected ${key ?? 'an object'} to be stored; held keys: ${JSON.stringify(this.keys)}`,
    );
  }

  assertNotStored(key?: string): void {
    const isStored =
      key === undefined ? this.objects.size > 0 : this.objects.has(key);

    if (!isStored) {
      return;
    }

    throw new FakeAssertionError(
      `Expected ${key ?? 'no object'} not to be stored; held keys: ${JSON.stringify(this.keys)}`,
    );
  }

  assertRemoved(key: string): void {
    this.assertRecorded(
      (operation) => operation.operation === 'remove' && operation.key === key,
    );
  }

  assertOperation(
    predicate?: RecordPredicate<RecordedStorageOperation>,
    times?: number,
  ): void {
    this.assertRecorded(predicate, times);
  }
}
