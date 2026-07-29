import type {
  CapabilityDecision,
  CapabilitySubject,
} from './capabilities.types';

export type PolicyCheck<TRecord = unknown> = (
  subject: CapabilitySubject,
  record?: TRecord,
) => CapabilityDecision;

export interface RecordLoader<TRecord = unknown> {
  load(id: string): Promise<TRecord | null>;
}
