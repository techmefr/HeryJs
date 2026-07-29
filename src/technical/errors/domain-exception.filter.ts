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
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const resolved = this.resolve(exception);

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
      return {
        status: exception.getStatus(),
        key: 'http.error',
        message: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      key: 'internal.error',
      message: 'Internal server error.',
    };
  }
}
