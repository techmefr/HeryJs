import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SsoRefusedException } from './sso-refused.exception';

export type SsoHostResolver = (host: string) => Promise<string[]>;

export const SSO_HOST_RESOLVER = Symbol('SSO_HOST_RESOLVER');

const IPV4_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

const MAPPED_IPV4_PREFIX = '::ffff:';

export const systemHostResolver: SsoHostResolver = async (host) => {
  const records = await lookup(host, { all: true });

  return records.map((record) => record.address);
};

function ipv4ToNumber(address: string): number {
  return address
    .split('.')
    .reduce((total, octet) => total * 256 + Number(octet), 0);
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);

  return IPV4_BLOCKS.some(([base, bits]) => {
    const size = 2 ** (32 - bits);

    return value >= base && value < base + size;
  });
}

function isPrivateIpv6(address: string): boolean {
  const lower = address.toLowerCase();

  if (lower.startsWith(MAPPED_IPV4_PREFIX)) {
    return isPrivateIpv4(lower.slice(MAPPED_IPV4_PREFIX.length));
  }

  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb') ||
    lower.startsWith('ff')
  );
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  return family === 6 ? isPrivateIpv6(address) : true;
}

export async function assertPublicHttpsUrl(
  value: string,
  resolve: SsoHostResolver,
  isPrivateAllowed: boolean,
): Promise<URL> {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new SsoRefusedException('untrusted-issuer');
  }

  const isSecure = url.protocol === 'https:';
  const isLocalHttp = isPrivateAllowed && url.protocol === 'http:';

  if ((!isSecure && !isLocalHttp) || url.username || url.password) {
    throw new SsoRefusedException('untrusted-issuer');
  }

  if (isPrivateAllowed) {
    return url;
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await resolveOrRefuse(host, resolve);

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new SsoRefusedException('untrusted-issuer');
  }

  return url;
}

async function resolveOrRefuse(
  host: string,
  resolve: SsoHostResolver,
): Promise<string[]> {
  try {
    return await resolve(host);
  } catch {
    throw new SsoRefusedException('untrusted-issuer');
  }
}
