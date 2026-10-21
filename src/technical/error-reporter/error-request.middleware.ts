import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ErrorRequestContext } from './error-request-context';

@Injectable()
export class ErrorRequestMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    ErrorRequestContext.run(
      { method: req.method, path: req.originalUrl.split('?')[0]! },
      next,
    );
  }
}
