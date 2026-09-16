import { All, Controller, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { getAuthContext } from './better-auth.instance';

/**
 * Password reset, email verification, two-factor and social login are all
 * implemented by Better Auth, and every one of them was unreachable before
 * this controller existed: the app mounted only its own register/login/
 * dev-token routes, so the library's handler answered nothing. Configuring
 * those flows without mounting this is the failure mode worth naming -- the
 * options look right, the docs look right, and every endpoint 404s.
 *
 * Mounting the handler wholesale rather than declaring four routes by hand is
 * the library's own contract: the flows are multi-step, and the second step of
 * a reset is a route this app never named. The cost is that **every** endpoint
 * Better Auth declares becomes public, not only the four that were wanted --
 * audit `GET /api/auth/reference` against the enabled plugins before a
 * deployment, because enabling a plugin here silently adds routes.
 *
 * `/api/auth` is Better Auth's own default basePath, left unset in the
 * instance; changing one without the other breaks every callback URL the
 * library generates, including the ones already emailed out.
 */
@Controller('api/auth')
export class BetterAuthController {
  @All('*path')
  @RateLimit('auth')
  @PublicRoute(
    'every flow here runs before there is a caller: resetting a password, verifying an address, or returning from an OAuth provider',
  )
  async handle(
    @Req() request: RawBodyRequest<ExpressRequest>,
    @Res() response: Response,
  ): Promise<void> {
    const { auth } = await getAuthContext();
    const result = await auth.handler(toWebRequest(request));

    result.headers.forEach((value, key) => {
      // append, not set: a single sign-in answers with several Set-Cookie
      // headers, and setting them collapses all but the last -- the session
      // cookie survives and the CSRF one silently does not.
      response.append(key, value);
    });

    response.status(result.status);
    response.send(Buffer.from(await result.arrayBuffer()));
  }
}

/**
 * Built from `rawBody` rather than from the parsed body: Express has already
 * consumed the stream by the time this runs, and re-serialising `req.body`
 * changes the bytes. Better Auth signs and verifies some payloads, so a
 * re-encoded body that differs by a key order or an escape fails a signature
 * check that the original would have passed.
 */
function toWebRequest(request: RawBodyRequest<ExpressRequest>): Request {
  const url = `${request.protocol}://${request.get('host') ?? 'localhost'}${request.originalUrl}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
      continue;
    }

    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  // Buffer is not a BodyInit, and passing it through a string would re-encode
  // anything that is not valid UTF-8. A view over the same bytes is.
  const body =
    hasBody && request.rawBody ? new Uint8Array(request.rawBody) : null;

  return new Request(url, { method: request.method, headers, body });
}
