import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { InjectionToken } from '@nestjs/common';
import type { PolicyCheck } from './capability-check';

export const CAPABILITY_CHECK = 'capability:check';
export const CAPABILITY_RECORD_LOADER = 'capability:record-loader';
export const CAPABILITY_RECORD_NOT_FOUND_RESOURCE =
  'capability:record-not-found-resource';

export const Capability = <TRecord>(check: PolicyCheck<TRecord>) =>
  SetMetadata(CAPABILITY_CHECK, check);

/**
 * `resource` becomes the `<resource>.notFound` key CapabilitiesGuard throws
 * when the loader finds nothing -- the documented contract every other
 * exception in this codebase follows. Omitting it falls back to the guard's
 * own generic literal.
 */
export const LoadRecordWith = (loader: InjectionToken, resource?: string) =>
  resource === undefined
    ? SetMetadata(CAPABILITY_RECORD_LOADER, loader)
    : applyDecorators(
        SetMetadata(CAPABILITY_RECORD_LOADER, loader),
        SetMetadata(CAPABILITY_RECORD_NOT_FOUND_RESOURCE, resource),
      );
