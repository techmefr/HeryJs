import { env } from '#technical/config/env';

/**
 * Read on every call, the way DevOnlyGuard reads NODE_ENV: the answer is a
 * property of the running process, and a test that flips it must see the flip.
 * The three ADMIN_STUDIO_* names come from the validated env, so a malformed
 * value stops the boot instead of silently reading as "off".
 */
export interface AdminStudioSettings {
  production: boolean;
  enabled: boolean;
  allowedIps: string[];
  requireTwoFactor: boolean;
}

export function adminStudioSettings(): AdminStudioSettings {
  return {
    production: process.env.NODE_ENV === 'production',
    enabled: env.ADMIN_STUDIO_ENABLED === 'true',
    allowedIps: (env.ADMIN_STUDIO_ALLOWED_IPS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
    requireTwoFactor: env.ADMIN_STUDIO_REQUIRE_2FA === 'true',
  };
}

/** `::ffff:10.0.0.1` is how a dual-stack socket reports an IPv4 peer. */
export function normalizeIp(ip: string | undefined): string {
  return (ip ?? '').replace(/^::ffff:/, '');
}
