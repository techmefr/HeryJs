import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AuditSinkRefusedException } from '#technical/errors/audit-sink-refused.exception';

export type SinkHostResolver = (host: string) => Promise<string[]>;

export const systemHostResolver: SinkHostResolver = async (host) => {
  const records = await lookup(host, { all: true });

  return records.map((record) => record.address);
};

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
const IPV6_PRIVATE_PREFIXES = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb', 'ff'];

function isPrivateIpv4(address: string): boolean {
  const value = address
    .split('.')
    .reduce((total, octet) => total * 256 + Number(octet), 0);

  return IPV4_BLOCKS.some(
    ([base, bits]) => value >= base && value < base + 2 ** (32 - bits),
  );
}

// WHATWG URL rewrites `[::ffff:10.0.0.1]` to `[::ffff:a00:1]`, so the mapped
// form arrives as two hex groups as often as it does as a dotted quad.
function mappedIpv4Of(rest: string): string {
  const groups = rest.split(':');

  if (groups.length !== 2) {
    return rest;
  }

  const high = Number.parseInt(groups[0] ?? '', 16);
  const low = Number.parseInt(groups[1] ?? '', 16);

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family !== 6) {
    return true;
  }

  const lower = address.toLowerCase();

  if (lower.startsWith(MAPPED_IPV4_PREFIX)) {
    return isPrivateIpv4(mappedIpv4Of(lower.slice(MAPPED_IPV4_PREFIX.length)));
  }

  return (
    lower === '::' ||
    lower === '::1' ||
    IPV6_PRIVATE_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

/**
 * The sink URL is typed by an operator and called by the server, with the
 * tenant's audit entries in the body. Only http(s) with no credentials in the
 * URL is accepted, and a host that resolves to a private, loopback or
 * link-local address is refused unless the deployment opted in with
 * AUDIT_SINK_ALLOW_PRIVATE_HOSTS, so the sink cannot be aimed at the internal
 * network. The check runs again at delivery: a name can resolve elsewhere
 * after the sink was saved.
 */
export async function assertSinkUrl(
  value: string,
  options: { allowPrivate: boolean; resolve?: SinkHostResolver },
): Promise<void> {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AuditSinkRefusedException('the URL is not valid');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AuditSinkRefusedException('only http and https URLs are allowed');
  }

  if (url.username || url.password) {
    throw new AuditSinkRefusedException(
      'credentials do not belong in the URL, use the token field',
    );
  }

  if (options.allowPrivate) {
    return;
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];

  try {
    addresses = isIP(host)
      ? [host]
      : await (options.resolve ?? systemHostResolver)(host);
  } catch {
    throw new AuditSinkRefusedException(`the host "${host}" does not resolve`);
  }

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new AuditSinkRefusedException(
      'the host resolves to a private or loopback address',
    );
  }
}
