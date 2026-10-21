import { WebhookRefusedException } from './webhook-refused.exception';
import { assertDeliverableUrl, isPrivateAddress } from './webhook-url-guard';
import type { WebhookHostResolver } from './webhook-url-guard';

const publicHost: WebhookHostResolver = () =>
  Promise.resolve(['93.184.216.34']);

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    'not-an-ip',
  ])('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '172.32.0.1',
    '::ffff:808:808',
    '2606:4700:4700::1111',
  ])('treats %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('assertDeliverableUrl', () => {
  it('accepts an https url resolving to a public address', async () => {
    const url = await assertDeliverableUrl(
      'https://hooks.acme.test/in',
      publicHost,
      false,
    );

    expect(url.hostname).toBe('hooks.acme.test');
  });

  it.each([
    'http://hooks.acme.test',
    'https://user:pass@hooks.acme.test',
    'ftp://hooks.acme.test',
    'https://127.0.0.1/in',
    'https://[::1]/in',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
  ])('refuses %s', async (value) => {
    await expect(
      assertDeliverableUrl(value, publicHost, false),
    ).rejects.toBeInstanceOf(WebhookRefusedException);
  });

  it('refuses a host that resolves to a private address, even next to a public one', async () => {
    const mixed: WebhookHostResolver = () =>
      Promise.resolve(['93.184.216.34', '10.0.0.5']);

    await expect(
      assertDeliverableUrl('https://hooks.acme.test', mixed, false),
    ).rejects.toBeInstanceOf(WebhookRefusedException);
  });

  it('refuses a host that does not resolve', async () => {
    const missing: WebhookHostResolver = () =>
      Promise.reject(new Error('nxdomain'));

    await expect(
      assertDeliverableUrl('https://nowhere.acme.test', missing, false),
    ).rejects.toBeInstanceOf(WebhookRefusedException);
  });

  it('lets a local http url through only when private urls are allowed', async () => {
    const url = await assertDeliverableUrl(
      'http://localhost:4000/in',
      publicHost,
      true,
    );

    expect(url.port).toBe('4000');
    await expect(
      assertDeliverableUrl('http://localhost:4000/in', publicHost, false),
    ).rejects.toBeInstanceOf(WebhookRefusedException);
  });
});
