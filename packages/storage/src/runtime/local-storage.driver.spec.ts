import { readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { InvalidStorageKeyException } from './invalid-storage-key.exception';
import { LocalStorageDriver } from './local-storage.driver';

const ESCAPING_KEYS = [
  '../escaped.txt',
  '../../escaped.txt',
  'nested/../../escaped.txt',
  '..',
];

describe('local storage keys', () => {
  const driver = new LocalStorageDriver();

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
      driver.put('inside.txt.meta.json', Buffer.from('{}'), 'text/plain'),
    ).rejects.toThrow(InvalidStorageKeyException);
  });

  it.each(ESCAPING_KEYS)(
    'refuses to write outside the root with %s',
    async (key) => {
      await expect(
        driver.put(key, Buffer.from('owned'), 'text/plain'),
      ).rejects.toThrow(InvalidStorageKeyException);
    },
  );

  it.each(ESCAPING_KEYS)(
    'refuses to read outside the root with %s',
    async (key) => {
      await expect(driver.read(key)).rejects.toThrow(
        InvalidStorageKeyException,
      );
    },
  );

  it.each(ESCAPING_KEYS)(
    'refuses to get outside the root with %s',
    async (key) => {
      await expect(driver.get(key)).rejects.toThrow(InvalidStorageKeyException);
    },
  );

  it.each(ESCAPING_KEYS)(
    'refuses to remove outside the root with %s',
    async (key) => {
      await expect(driver.remove(key)).rejects.toThrow(
        InvalidStorageKeyException,
      );
    },
  );

  it('still stores and reads back a key inside the root', async () => {
    await driver.put('inside.txt', Buffer.from('kept'), 'text/plain');
    await expect(driver.read('inside.txt')).resolves.toEqual(
      Buffer.from('kept'),
    );
    await expect(driver.get('inside.txt')).resolves.toEqual(
      Buffer.from('kept'),
    );
    await expect(
      readFile(path.resolve(process.cwd(), 'storage', 'inside.txt'), 'utf8'),
    ).resolves.toBe('kept');
    await expect(driver.contentTypeOf('inside.txt')).resolves.toBe(
      'text/plain',
    );
  });
});
