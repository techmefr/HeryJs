import './passwordless-test-env';
import { getAuthContext } from './better-auth.instance';

interface AuthEndpoint {
  path?: string;
  options?: { method?: string | string[] };
}

const PASSWORDLESS_ROUTES = [
  'GET /magic-link/verify',
  'POST /email-otp/change-email',
  'POST /email-otp/check-verification-otp',
  'POST /email-otp/request-email-change',
  'POST /email-otp/request-password-reset',
  'POST /email-otp/reset-password',
  'POST /email-otp/send-verification-otp',
  'POST /email-otp/verify-email',
  'POST /forget-password/email-otp',
  'POST /phone-number/request-password-reset',
  'POST /phone-number/reset-password',
  'POST /phone-number/send-otp',
  'POST /phone-number/verify',
  'POST /sign-in/anonymous',
  'POST /sign-in/email-otp',
  'POST /sign-in/magic-link',
  'POST /sign-in/phone-number',
  'POST /passkey/delete-passkey',
  'GET /passkey/generate-authenticate-options',
  'GET /passkey/generate-register-options',
  'GET /passkey/list-user-passkeys',
  'POST /passkey/update-passkey',
  'POST /passkey/verify-authentication',
  'POST /passkey/verify-registration',
  'POST /delete-anonymous-user',
];

/**
 * The twin of better-auth-routes.spec.ts for the opt-in half: turning a method
 * on widens what the catch-all mount serves, and the list of what it adds is
 * written down here so that widening is a reviewed diff rather than a side
 * effect of an environment variable.
 */
describe('what the passwordless methods add to /api/auth/*', () => {
  it('adds exactly the routes this repository has looked at', async () => {
    const { auth } = await getAuthContext();
    const api = auth.api as Record<string, AuthEndpoint>;

    const mounted = Object.values(api)
      .filter((endpoint) => typeof endpoint?.path === 'string')
      .map((endpoint) => {
        const method = endpoint.options?.method ?? '?';

        return `${Array.isArray(method) ? method.join(',') : method} ${endpoint.path as string}`;
      });

    const added = mounted.filter((route) =>
      /magic-link|email-otp|phone-number|anonymous|passkey/.test(route),
    );

    expect(added.sort()).toEqual([...PASSWORDLESS_ROUTES].sort());
  });
});
