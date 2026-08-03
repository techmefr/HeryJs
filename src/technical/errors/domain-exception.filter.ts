import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from './domain.exception';
import { renderErrorPage } from './error-page';

interface ResolvedError {
  status: number;
  key: string;
  message: string;
  details?: unknown;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const resolved = this.resolve(exception);

    if (host.getType() !== 'http') {
      throw new HttpException(resolved.message, resolved.status);
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (request.headers.accept?.includes('text/html')) {
      response
        .status(resolved.status)
        .type('html')
        .send(renderErrorPage(resolved.status, resolved.message));
      return;
    }

    response.status(resolved.status).json({ error: resolved });
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof DomainException) {
      return {
        status: exception.getStatus(),
        key: exception.key,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      return {
        status: exception.getStatus(),
        key: 'http.error',
        message: exception.message,
        // ZodValidationPipe throws BadRequestException(result.error.flatten()):
        // that body has no `message` key, so field errors were silently lost
        // -- the client only ever saw the class name. Terminus's health check
        // failure carries its per-indicator detail the same way. The envelope
        // already has a `details` key for exactly this.
        details: typeof body === 'object' && body !== null ? body : undefined,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      key: 'internal.error',
      message: 'Internal server error.',
    };
  }
}
