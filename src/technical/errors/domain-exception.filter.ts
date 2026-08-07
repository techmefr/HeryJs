import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { TraceContextStorage } from '#technical/tracing/trace-context';
import { DomainException } from './domain.exception';
import { InvalidQueryValueException } from './invalid-query.exception';
import { renderErrorPage } from './error-page';

export interface ResolvedError {
  status: number;
  key: string;
  message: string;
  details?: unknown;
}

const logger = new Logger('UnhandledError');

/**
 * An exception this framework does not recognise is the one case where the
 * client cannot be told what happened -- the message could name a table, a
 * column or a connection string. It used to be dropped instead: a bare
 * "Internal server error." went out and the stack went nowhere, so a
 * production 500 left nothing behind to read.
 *
 * It is now written down twice. The stack goes to the logger, which is what
 * the terminal, `docker compose logs` and any log collector already read, and
 * a step goes to the request trace so the pipeline page shows the failing
 * request in development. Both carry the same generated id, and so does the
 * response, which is what lets a caller quoting an id be answered from the
 * logs without the response ever having to explain itself.
 */
function reportUnknownError(exception: unknown): ResolvedError {
  const errorId = randomUUID();
  const error =
    exception instanceof Error ? exception : new Error(String(exception));

  logger.error(`[${errorId}] ${error.name}: ${error.message}`, error.stack);

  TraceContextStorage.pushStep({
    stage: 'controller',
    label: 'unhandled error',
    status: 'error',
    durationMs: 0,
    detail: { errorId, name: error.name, message: error.message },
  });

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    key: 'internal.error',
    message: 'Internal server error.',
    details: { errorId },
  };
}

/**
 * A value of the wrong type is the caller's mistake, and only the driver is in a
 * position to notice it -- so the 400 is decided here, from the error Prisma
 * throws. The original is still written to the log at warn level with the same
 * id: the other way to reach a validation error is a bug in a query this
 * framework built itself, and that has to stay findable rather than be answered
 * with "your request was invalid" and forgotten.
 */
function reportInvalidQueryValue(error: Error): ResolvedError {
  const errorId = randomUUID();

  logger.warn(`[${errorId}] ${error.name}: ${error.message}`);

  TraceContextStorage.pushStep({
    stage: 'prisma',
    label: 'rejected value',
    status: 'error',
    durationMs: 0,
    detail: { errorId, name: error.name },
  });

  const exception = new InvalidQueryValueException();

  return {
    status: exception.getStatus(),
    key: exception.key,
    message: exception.message,
    details: { ...(exception.details as Record<string, unknown>), errorId },
  };
}

// P2023 is the same family: a value that cannot be the column it is compared to
// -- a malformed uuid on a project whose ids are uuids, where this framework's
// own default is a cuid and would never produce one.
const CLIENT_VALUE_ERROR_CODES = new Set(['P2023']);

function isClientValueError(exception: unknown): exception is Error {
  return (
    exception instanceof Prisma.PrismaClientValidationError ||
    (exception instanceof Prisma.PrismaClientKnownRequestError &&
      CLIENT_VALUE_ERROR_CODES.has(exception.code))
  );
}

// Shared with batch routes (create/update/delete/restore over an array):
// one failed entry there gets this exact shape inline in the results array,
// rather than the whole request 500ing or a second error format to document.
export function resolveDomainError(exception: unknown): ResolvedError {
  if (exception instanceof DomainException) {
    return {
      status: exception.getStatus(),
      key: exception.key,
      message: exception.message,
      details: exception.details,
    };
  }

  if (isClientValueError(exception)) {
    return reportInvalidQueryValue(exception);
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

  return reportUnknownError(exception);
}

function errorIdOf(resolved: ResolvedError): string | undefined {
  const details = resolved.details;

  return typeof details === 'object' &&
    details !== null &&
    'errorId' in details &&
    typeof details.errorId === 'string'
    ? details.errorId
    : undefined;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const resolved = resolveDomainError(exception);

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
        .send(
          renderErrorPage(
            resolved.status,
            resolved.message,
            errorIdOf(resolved),
          ),
        );
      return;
    }

    response.status(resolved.status).json({ error: resolved });
  }
}
