import { readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { InvalidStorageKeyException } from './invalid-storage-key.exception';
import { LocalStorageProvider } from './local-storage.provider';

const ESCAPING_KEYS = [
  '../escaped.txt',
  '../../escaped.txt',
  'nested/../../escaped.txt',
  '..',
];

describe('local storage keys', () => {
  const provider = new LocalStorageProvider();

  afterAll(async () => {
    await rm(path.resolve(process.cwd(), 'storage', 'inside.txt'), {
      force: true,
    });
    await rm(path.resolve(process.cwd(), 'storage', 'inside.txt.meta.json'), {
      force: true,
    });
  });

  it('refuses a key that would land on another object metadata', async () => {
    await expect(
      provider.put('inside.txt.meta.json', Buffer.from('{}'), 'text/plain'),
    ).rejects.toThrow(InvalidStorageKeyException);
  });

  it.each(ESCAPING_KEYS)(
    'refuses to write outside the root with %s',
    async (key) => {
      await expect(
        provider.put(key, Buffer.from('owned'), 'text/plain'),
      ).rejects.toThrow(InvalidStorageKeyException);
    },
  );

  it.each(ESCAPING_KEYS)(
    'refuses to read outside the root with %s',
    async (key) => {
      await expect(provider.read(key)).rejects.toThrow(
        InvalidStorageKeyException,
      );
    },
  );

  it.each(ESCAPING_KEYS)(
    'refuses to remove outside the root with %s',
    async (key) => {
      await expect(provider.remove(key)).rejects.toThrow(
        InvalidStorageKeyException,
      );
    },
  );

  it('still stores and reads back a key inside the root', async () => {
    await provider.put('inside.txt', Buffer.from('kept'), 'text/plain');
    await expect(provider.read('inside.txt')).resolves.toEqual(
      Buffer.from('kept'),
    );
    await expect(
      readFile(path.resolve(process.cwd(), 'storage', 'inside.txt'), 'utf8'),
    ).resolves.toBe('kept');
    await expect(provider.contentTypeOf('inside.txt')).resolves.toBe(
      'text/plain',
    );
  });
});
