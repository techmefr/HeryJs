import { SetMetadata } from '@nestjs/common';
import type { InjectionToken } from '@nestjs/common';
import type { PolicyCheck } from './capability-check';

export const CAPABILITY_CHECK = 'capability:check';
export const CAPABILITY_RECORD_LOADER = 'capability:record-loader';

export const Capability = <TRecord>(check: PolicyCheck<TRecord>) =>
  SetMetadata(CAPABILITY_CHECK, check);

export const LoadRecordWith = (loader: InjectionToken) =>
  SetMetadata(CAPABILITY_RECORD_LOADER, loader);
