import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { NotFoundException } from '@nestjs/common';
import { TraceContextStorage } from '#kernel/tracing/trace-context';
import { LocalStorageProvider } from './local-storage.provider';

/**
 * A signed URL is handed to a browser -- an `<img src>`, a download link -- so
 * it carries no session and cannot: the signature and the expiry in the query
 * string *are* the credential. Verifying them in a guard rather than inside the
 * handler is what makes that an explicit decision: the route is gated, by
 * something other than a capability, and the pipeline trace says so.
 */
@Injectable()
export class StorageSignatureGuard implements CanActivate {
  constructor(private readonly local: LocalStorageProvider) {}

  canActivate(context: ExecutionContext): boolean {
    const start = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const key = String(request.params.key ?? '');
    const query = request.query as { exp?: string; sig?: string };
    const durationMs = () =>
      Number(process.hrtime.bigint() - start) / 1_000_000;

    if (!this.local.verify(key, Number(query.exp), String(query.sig ?? ''))) {
      TraceContextStorage.pushStep({
        stage: 'guard',
        label: 'storage signature',
        status: 'blocked',
        durationMs: durationMs(),
        detail: { reason: 'invalid or expired signature' },
      });
      // Never "forbidden": that would confirm the key names a real object to a
      // caller holding no valid signature for it.
      throw new NotFoundException();
    }

    TraceContextStorage.pushStep({
      stage: 'guard',
      label: 'storage signature',
      status: 'ok',
      durationMs: durationMs(),
    });

    return true;
  }
}
