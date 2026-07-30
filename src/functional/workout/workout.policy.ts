import { Injectable } from '@nestjs/common';
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import {
  resolveCapability,
  resolveCollectionCapability,
} from '../../technical/capabilities/resolve-capability';
import type { PolicyCheck } from '../../technical/capabilities/capability-check';
import {
  CapabilityDecision,
  CapabilitySubject,
} from '../../technical/capabilities/capabilities.types';

export interface WorkoutRecordLike {
  ownerId: string;
}

export const canCreateWorkout: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});

export const canUpdateWorkout: PolicyCheck<WorkoutRecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('own', subject, record) : { allowed: false });

export const canDeleteWorkout: PolicyCheck<WorkoutRecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('own', subject, record) : { allowed: false });

export const canViewWorkout: PolicyCheck<WorkoutRecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('own', subject, record) : { allowed: false });

// Same preset as canViewWorkout: whoever may read one record may ask for the
// collection, and scopeWhereFor narrows that collection to the very same rows.
export const canViewAnyWorkout: PolicyCheck = (subject) =>
  resolveCollectionCapability('own', subject);

// Listing the bin is a moderation move, so it follows the delete preset rather
// than the read one.
export const canListTrashedWorkout: PolicyCheck = (subject) =>
  resolveCollectionCapability('own', subject);

@Injectable()
export class WorkoutPolicy {
  constructor(private readonly capabilities: CapabilitiesService) {}

  recordCapabilities(
    subject: CapabilitySubject,
    record: WorkoutRecordLike,
  ): Record<'update' | 'delete', CapabilityDecision> {
    return {
      update: this.capabilities.resolve('own', subject, record),
      delete: this.capabilities.resolve('own', subject, record),
    };
  }

  metaCapabilities(
    subject: CapabilitySubject,
  ): Record<'create', CapabilityDecision> {
    return {
      create: canCreateWorkout(subject),
    };
  }
}
