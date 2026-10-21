import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScimException } from './scim.exception';
import type { ScimErrorBody } from './scim.exception';
import { SCIM_CONTENT_TYPE, SCIM_ERROR_SCHEMA } from './scim.types';

/**
 * Scoped to the SCIM controllers, so a refusal that comes from anywhere along
 * the way -- the token guard, the rate limiter, the body parser -- reaches the
 * directory in the one error format it understands. Anything that is not an
 * HTTP error is reported without its message: a directory is not the place a
 * stack trace belongs.
 */
@Catch()
export class ScimExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Scim');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.bodyOf(exception);

    response.status(Number(body.status)).type(SCIM_CONTENT_TYPE).json(body);
  }

  private bodyOf(exception: unknown): ScimErrorBody {
    if (exception instanceof ScimException) {
      return exception.body();
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      return {
        schemas: [SCIM_ERROR_SCHEMA],
        status: String(status),
        ...(status === Number(HttpStatus.BAD_REQUEST)
          ? { scimType: 'invalidSyntax' as const }
          : {}),
        detail:
          status < Number(HttpStatus.INTERNAL_SERVER_ERROR)
            ? exception.message
            : 'The SCIM service failed.',
      };
    }

    this.logger.error(exception);

    return {
      schemas: [SCIM_ERROR_SCHEMA],
      status: String(HttpStatus.INTERNAL_SERVER_ERROR),
      detail: 'The SCIM service failed.',
    };
  }
}
