/**
 * Read from the process environment on every call, the way DevOnlyGuard reads
 * NODE_ENV: the answer is a property of the running process, and a test that
 * flips it must see the flip. The same names are declared in the env schema so
 * a malformed value stops the boot instead of silently reading as "off".
 */
export interface AdminStudioSettings {
  production: boolean;
  enabled: boolean;
  allowedIps: string[];
  requireTwoFactor: boolean;
}

export function adminStudioSettings(
  source: NodeJS.ProcessEnv = process.env,
): AdminStudioSettings {
  return {
    production: source.NODE_ENV === 'production',
    enabled: source.ADMIN_STUDIO_ENABLED === 'true',
    allowedIps: (source.ADMIN_STUDIO_ALLOWED_IPS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
    requireTwoFactor: source.ADMIN_STUDIO_REQUIRE_2FA === 'true',
  };
}

/** `::ffff:10.0.0.1` is how a dual-stack socket reports an IPv4 peer. */
export function normalizeIp(ip: string | undefined): string {
  return (ip ?? '').replace(/^::ffff:/, '');
}
