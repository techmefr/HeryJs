import { assertSinkUrl } from './audit-sink-url';

const publicHost = () => Promise.resolve(['93.184.216.34']);

describe('assertSinkUrl', () => {
  it('accepts an https URL that resolves to a public address', async () => {
    await expect(
      assertSinkUrl('https://siem.example.com/ingest', {
        allowPrivate: false,
        resolve: publicHost,
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['not a URL', 'siem'],
    ['a file URL', 'file:///etc/passwd'],
    ['credentials in the URL', 'https://user:pass@siem.example.com/'],
  ])('refuses %s', async (_label, url) => {
    await expect(
      assertSinkUrl(url, { allowPrivate: false, resolve: publicHost }),
    ).rejects.toMatchObject({ key: 'audit.sink.refused' });
  });

  it.each([
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/x',
    'http://[fd00::1]/x',
    'http://[::ffff:10.0.0.1]/x',
  ])('refuses the private literal %s', async (url) => {
    await expect(
      assertSinkUrl(url, { allowPrivate: false, resolve: publicHost }),
    ).rejects.toMatchObject({ key: 'audit.sink.refused' });
  });

  it('refuses a name that resolves to a private address, even one of several', async () => {
    await expect(
      assertSinkUrl('https://rebind.example.com/', {
        allowPrivate: false,
        resolve: () => Promise.resolve(['93.184.216.34', '10.1.2.3']),
      }),
    ).rejects.toMatchObject({ key: 'audit.sink.refused' });
  });

  it('refuses a name that does not resolve', async () => {
    await expect(
      assertSinkUrl('https://nowhere.example.com/', {
        allowPrivate: false,
        resolve: () => Promise.reject(new Error('ENOTFOUND')),
      }),
    ).rejects.toMatchObject({ key: 'audit.sink.refused' });
  });

  it('lets a private host through only when the deployment opted in', async () => {
    await expect(
      assertSinkUrl('http://127.0.0.1:9000/x', { allowPrivate: true }),
    ).resolves.toBeUndefined();
  });
});
