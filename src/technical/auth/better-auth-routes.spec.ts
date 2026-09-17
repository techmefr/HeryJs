import { getAuthContext } from './better-auth.instance';

/**
 * `BetterAuthController` mounts Better Auth's handler under a catch-all, which
 * is what makes password reset, email verification, 2FA and social login
 * reachable at all. The cost is that it exposes **every** endpoint the library
 * declares, and enabling a plugin widens that surface with nothing in this
 * repository saying so.
 *
 * This is the thing that says so. A plugin added, removed or upgraded changes
 * this list, the build fails, and somebody reads the diff -- which is the only
 * moment anyone would otherwise have looked.
 *
 * Two entries here deserve their own attention rather than blanket approval,
 * and both are recorded in the issue rather than silently blessed by this
 * test passing:
 *
 * - the `/admin/*` routes are gated by the admin plugin's own role check, not
 *   by this framework's capabilities. Privileged operations answering to a
 *   second authorization system is a real decision, not an accident.
 * - `/sign-up/email` is a second registration route beside the app's own
 *   `/auth/register`. If the two do not assign a tenant the same way, the
 *   weaker one is the one that matters.
 */
const EXPECTED_ROUTES = [
  'GET /account-info',
  'GET /admin/get-user',
  'GET /admin/list-users',
  'GET /delete-user/callback',
  'GET /error',
  'GET /list-accounts',
  'GET /list-sessions',
  'GET /ok',
  'GET /reset-password/:token',
  'GET /verify-email',
  'GET,POST /callback/:id',
  'GET,POST /get-session',
  'POST /admin/ban-user',
  'POST /admin/create-user',
  'POST /admin/has-permission',
  'POST /admin/impersonate-user',
  'POST /admin/list-user-sessions',
  'POST /admin/remove-user',
  'POST /admin/revoke-user-session',
  'POST /admin/revoke-user-sessions',
  'POST /admin/set-role',
  'POST /admin/set-user-password',
  'POST /admin/stop-impersonating',
  'POST /admin/unban-user',
  'POST /admin/update-user',
  'POST /change-email',
  'POST /change-password',
  'POST /delete-user',
  'POST /get-access-token',
  'POST /link-social',
  'POST /refresh-token',
  'POST /request-password-reset',
  'POST /reset-password',
  'POST /revoke-other-sessions',
  'POST /revoke-session',
  'POST /revoke-sessions',
  'POST /send-verification-email',
  'POST /sign-in/email',
  'POST /sign-in/social',
  'POST /sign-out',
  'POST /sign-up/email',
  'POST /two-factor/disable',
  'POST /two-factor/enable',
  'POST /two-factor/generate-backup-codes',
  'POST /two-factor/get-totp-uri',
  'POST /two-factor/send-otp',
  'POST /two-factor/verify-backup-code',
  'POST /two-factor/verify-otp',
  'POST /two-factor/verify-totp',
  'POST /unlink-account',
  'POST /update-session',
  'POST /update-user',
  'POST /verify-password',
];

interface AuthEndpoint {
  path?: string;
  // A string, or several when one path answers more than one verb -- which is
  // where the `GET,POST` entries in the list above come from.
  options?: { method?: string | string[] };
}

async function mountedRoutes(): Promise<string[]> {
  const { auth } = await getAuthContext();
  const api = auth.api as Record<string, AuthEndpoint>;

  return Object.values(api)
    .filter((endpoint) => typeof endpoint?.path === 'string')
    .map((endpoint) => {
      const method = endpoint.options?.method ?? '?';

      return `${Array.isArray(method) ? method.join(',') : method} ${endpoint.path as string}`;
    })
    .sort();
}

describe('what /api/auth/* actually serves', () => {
  it('serves exactly the routes this repository has looked at', async () => {
    expect(await mountedRoutes()).toEqual(EXPECTED_ROUTES);
  });

  /**
   * Not an assertion that this is fine -- an assertion that it is known. These
   * routes can ban a user, set a password and change a role, and they answer
   * to the admin plugin's own check rather than to CapabilitiesGuard.
   */
  it('still exposes the admin plugin surface, knowingly', async () => {
    const admin = (await mountedRoutes()).filter((route) =>
      route.includes(' /admin/'),
    );

    // Counted from the list above rather than written by hand: a number typed
    // from reading a terminal is a number that is wrong once and then trusted.
    expect(admin).toEqual(
      EXPECTED_ROUTES.filter((route) => route.includes(' /admin/')),
    );
    expect(admin.length).toBeGreaterThan(0);
  });

  // The framework's own /auth/register is not the only way to create an
  // account while this is mounted.
  it('still exposes a second registration route, knowingly', async () => {
    expect(await mountedRoutes()).toContain('POST /sign-up/email');
  });
});
