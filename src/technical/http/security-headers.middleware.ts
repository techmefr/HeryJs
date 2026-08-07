import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { BULL_BOARD_BASE_PATH } from '#technical/jobs/bull-board';

/**
 * The only HTML this application serves is the error page, which carries its own
 * inline styles and no script at all -- so the policy says exactly that, and a
 * response that somehow ends up rendering markup still cannot run anything.
 * Everything else is helmet's default: nosniff on the bytes the local storage
 * driver serves back, no framing, no referrer, and no Express banner on every
 * response.
 *
 * A middleware registered by the application rather than a line in main.ts,
 * because main.ts is the one file no test boots -- headers wired there would be
 * a promise nothing could check, and absent from every test's own app.
 */
const applyHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
});

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // The queue dashboard is a third-party UI that ships its own scripts, so
    // this policy would leave it blank. It is mounted in development only, by
    // main.ts, and never in production -- which is the only reason skipping it
    // is acceptable rather than a hole.
    // originalUrl rather than path: this middleware is mounted by Nest, and path
    // is relative to wherever it was mounted.
    if (req.originalUrl.startsWith(`${BULL_BOARD_BASE_PATH}/`)) {
      next();
      return;
    }

    applyHelmet(req, res, next);
  }
}
