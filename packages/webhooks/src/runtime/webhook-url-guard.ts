import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { WebhookRefusedException } from './webhook-refused.exception';

export type WebhookHostResolver = (host: string) => Promise<string[]>;

export const WEBHOOK_HOST_RESOLVER = Symbol('WEBHOOK_HOST_RESOLVER');

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
const HEXTET_BASE = 16;
const OCTET_RANGE = 256;

export const systemHostResolver: WebhookHostResolver = async (host) => {
  const records = await lookup(host, { all: true });

  return records.map((record) => record.address);
};

function ipv4ToNumber(address: string): number {
  return address
    .split('.')
    .reduce((total, octet) => total * OCTET_RANGE + Number(octet), 0);
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);

  return IPV4_BLOCKS.some(([base, bits]) => {
    const size = 2 ** (32 - bits);

    return value >= base && value < base + size;
  });
}

// Both spellings of an IPv4-mapped address reach the same host: `::ffff:a.b.c.d`
// and the hex form `::ffff:xxxx:xxxx` that a resolver or URL parser may hand
// back. Reading only the first would let `::ffff:7f00:1` through as public.
function mappedIpv4Of(lower: string): string | null {
  if (!lower.startsWith(MAPPED_IPV4_PREFIX)) {
    return null;
  }

  const rest = lower.slice(MAPPED_IPV4_PREFIX.length);

  if (rest.includes('.')) {
    return rest;
  }

  const hextets = rest.split(':').map((part) => parseInt(part, HEXTET_BASE));
  const [high, low] = hextets;

  if (hextets.length !== 2 || high === undefined || low === undefined) {
    return null;
  }

  return [
    Math.floor(high / OCTET_RANGE),
    high % OCTET_RANGE,
    Math.floor(low / OCTET_RANGE),
    low % OCTET_RANGE,
  ].join('.');
}

function isPrivateIpv6(address: string): boolean {
  const lower = address.toLowerCase();

  if (lower.startsWith(MAPPED_IPV4_PREFIX)) {
    const mapped = mappedIpv4Of(lower);

    return mapped === null || isPrivateIpv4(mapped);
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

/**
 * A tenant picks the URL, so this server is the one making the request: without
 * a check it is a way to reach the loopback, the cloud metadata address or any
 * internal service. The URL must be https, carry no credentials, and resolve
 * only to public addresses. It runs when a subscription is written and again
 * before every attempt, because DNS can change after the first check.
 *
 * Resolving here and connecting later leaves a rebinding window; the fetch does
 * not follow redirects, which is the larger half of that risk.
 */
export async function assertDeliverableUrl(
  value: string,
  resolve: WebhookHostResolver,
  isPrivateAllowed: boolean,
): Promise<URL> {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new WebhookRefusedException('url-refused');
  }

  const isSecure = url.protocol === 'https:';
  const isLocalHttp = isPrivateAllowed && url.protocol === 'http:';

  if ((!isSecure && !isLocalHttp) || url.username || url.password) {
    throw new WebhookRefusedException('url-refused');
  }

  if (isPrivateAllowed) {
    return url;
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await resolveOrRefuse(host, resolve);

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new WebhookRefusedException('url-refused');
  }

  return url;
}

async function resolveOrRefuse(
  host: string,
  resolve: WebhookHostResolver,
): Promise<string[]> {
  try {
    return await resolve(host);
  } catch {
    throw new WebhookRefusedException('url-refused');
  }
}
