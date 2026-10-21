import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { onUnhandledError } from '#technical/errors/domain-exception.filter';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { ErrorReporterDriverRegistry } from './error-reporter-driver.registry';
import { ErrorRequestContext } from './error-request-context';
import type {
  ErrorReportContext,
  ErrorReportUser,
} from './error-reporter-driver';

const FLUSH_TIMEOUT_MS = 2000;
const UNAUTHENTICATED_TENANT = 'unauthenticated';

export interface CaptureOptions {
  errorId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

function currentIdentity(): {
  tenantId: string | null;
  user: ErrorReportUser | null;
} {
  const context = TenantContextStorage.current();

  if (context === null) {
    return { tenantId: null, user: null };
  }

  return {
    tenantId:
      context.tenantId === UNAUTHENTICATED_TENANT ? null : context.tenantId,
    user:
      context.userId === undefined || context.userId === null
        ? null
        : {
            id: context.userId,
            impersonatedBy: context.impersonatedBy ?? null,
          },
  };
}

@Injectable()
export class ErrorReporterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErrorReporterService.name);

  constructor(private readonly registry: ErrorReporterDriverRegistry) {}

  onModuleInit(): void {
    onUnhandledError((error, errorId) => this.capture(error, { errorId }));
  }

  async onModuleDestroy(): Promise<void> {
    onUnhandledError(null);

    try {
      await this.registry.active.flush(FLUSH_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn(`the error reporter could not flush: ${String(error)}`);
    }
  }

  capture(error: Error, options: CaptureOptions = {}): void {
    const context: ErrorReportContext = {
      errorId: options.errorId ?? randomUUID(),
      ...currentIdentity(),
      request: ErrorRequestContext.current(),
      tags: options.tags ?? {},
      extra: options.extra ?? {},
    };

    this.deliver(error, context).catch((failure: unknown) => {
      this.logger.warn(
        `[${context.errorId}] the error reporter could not deliver this error: ${String(failure)}`,
      );
    });
  }

  private async deliver(
    error: Error,
    context: ErrorReportContext,
  ): Promise<void> {
    await this.registry.active.capture(error, context);
  }
}
