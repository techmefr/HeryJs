import { S3StorageDriver } from './s3-storage.driver';

describe('S3StorageDriver', () => {
  const nodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    delete process.env.STORAGE_S3_ACCESS_KEY;
    delete process.env.STORAGE_S3_SECRET_KEY;
  });

  /**
   * The module always provides this driver, so Nest builds it on every boot.
   * An app storing on local disk in production has no S3 credentials, and must
   * not be refused for that.
   */
  it('is constructible in production without credentials', () => {
    process.env.NODE_ENV = 'production';

    expect(() => new S3StorageDriver()).not.toThrow();
  });

  it('refuses the development credentials in production once it is used', async () => {
    process.env.NODE_ENV = 'production';

    await expect(new S3StorageDriver().stat('a/b.png')).rejects.toThrow(
      /STORAGE_S3_ACCESS_KEY/,
    );
  });
});
