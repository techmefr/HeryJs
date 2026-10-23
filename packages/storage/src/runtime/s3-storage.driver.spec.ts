import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
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

  it('lists past the thousand keys S3 returns in one page', async () => {
    const pages = [
      {
        Contents: [{ Key: 'privacy/erasures/a.json', Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      },
      {
        Contents: [{ Key: 'privacy/erasures/b.json', Size: 2 }],
        IsTruncated: false,
      },
    ];
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce(pages[0] as never)
      .mockResolvedValueOnce(pages[1] as never);

    try {
      expect(
        await new S3StorageDriver().list('privacy/erasures/', 5000),
      ).toEqual([
        { key: 'privacy/erasures/a.json', size: 1 },
        { key: 'privacy/erasures/b.json', size: 2 },
      ]);
      expect(
        (send.mock.calls[1]![0] as ListObjectsV2Command).input
          .ContinuationToken,
      ).toBe('next');
    } finally {
      send.mockRestore();
    }
  });
});
