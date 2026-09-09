import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LocaleContextStorage } from './locale-context';
import { negotiateLocale } from './locale-negotiation';
import { resolveDefaultLocale, resolveSupportedLocales } from './locale.config';

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const locale = negotiateLocale(
      req.header('accept-language'),
      resolveSupportedLocales(),
      resolveDefaultLocale(),
    );

    LocaleContextStorage.run(locale, () => next());
  }
}
