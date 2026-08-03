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
