import { ApiKeyService } from './api-key.service';
import type { AuthProvider, AuthenticatedUser } from './auth.types';

/**
 * The single place that decides which kind of credential a bearer token is.
 * The session guard and the tenant middleware both authenticate the same
 * request, and while each one answered that question for itself they were free
 * to disagree: the guard routed an API key to validateApiKey and resolved a
 * real caller, the middleware only ever tried validateSession and resolved
 * none, so the request ran under the guard's identity and the middleware's
 * tenant. Neither of them resolves a caller on its own any more.
 */
export function resolveCaller(
  provider: AuthProvider,
  token: string,
): Promise<AuthenticatedUser | null> {
  return ApiKeyService.isApiKey(token)
    ? provider.validateApiKey(token)
    : provider.validateSession(token);
}

const RESOLVED_CALLER = Symbol('heryResolvedCaller');

type CarriesCaller = {
  [RESOLVED_CALLER]?: {
    token: string;
    caller: Promise<AuthenticatedUser | null>;
  };
};

/**
 * Both halves of authentication read the same bearer token, so a request used
 * to cost two lookups in the auth store: one in the middleware to derive the
 * tenant, one in the guard to identify the caller. The answer is memoised on
 * the request object -- keyed by the token, so a request that somehow carries
 * two of them resolves both rather than reusing the wrong one -- and the
 * promise is stored rather than its result, so a guard running while the
 * middleware is still awaiting joins that lookup instead of starting another.
 */
export function resolveCallerOnce(
  provider: AuthProvider,
  token: string,
  request: object,
): Promise<AuthenticatedUser | null> {
  const carrier = request as CarriesCaller;
  const memo = carrier[RESOLVED_CALLER];

  if (memo?.token === token) {
    return memo.caller;
  }

  const caller = resolveCaller(provider, token);
  carrier[RESOLVED_CALLER] = { token, caller };

  return caller;
}
