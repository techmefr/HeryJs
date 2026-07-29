import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from './domain.exception';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainException) {
      response.status(exception.getStatus()).json({
        error: {
          status: exception.getStatus(),
          key: exception.key,
          message: exception.message,
          details: exception.details,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { status, key: 'http.error', message: exception.message },
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        key: 'internal.error',
        message: 'Internal server error.',
      },
    });
  }
}
