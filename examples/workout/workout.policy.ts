import { Injectable } from '@nestjs/common';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import {
  resolveCapability,
  resolveCollectionCapability,
} from '#technical/capabilities/resolve-capability';
import type { PolicyCheck } from '#technical/capabilities/capability-check';
import {
  CapabilityDecision,
  CapabilitySubject,
} from '#technical/capabilities/capabilities.types';

export interface WorkoutRecordLike {
  ownerId: string;
}

export const canCreateWorkout: PolicyCheck = (subject) =>
  resolveCollectionCapability('own', subject);

export const canUpdateWorkout: PolicyCheck<WorkoutRecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('own', subject, record) : { allowed: false });

// The outer gate on the bulk update/restore routes -- there is no single
// record yet to check against, so this is the same broad pass the collection
// search route takes, before update/restore/canUpdateWorkout narrows
// per record inside the handler.
export const canUpdateAnyWorkout: PolicyCheck = (subject) =>
  resolveCollectionCapability('own', subject);

export const canDeleteWorkout: PolicyCheck<WorkoutRecordLike> = (
  subject,
  record,
) => (record ? resolveCapability('own', subject, record) : { allowed: false });

// Same reasoning as canUpdateAnyWorkout, for the bulk delete route.
export const canDeleteAnyWorkout: PolicyCheck = (subject) =>
  resolveCollectionCapability('own', subject);

// Hard delete is not a scope on the delete preset -- own/team/all/none answer
// "whose records", not "how permanently". It is its own admin-only capability,
// checked in addition to (never instead of) the delete preset above.
export const canHardDeleteWorkout: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };

// Purge has no route today -- only the future admin decorator system reaches
// it -- but it is still gated by its own capability rather than reusing
// canHardDeleteWorkout, because a route may one day expose it under rules
// stricter than "any admin" (e.g. a second admin's approval).
export const canPurgeWorkout: PolicyCheck = (subject) =>
  subject.role === 'admin'
    ? { allowed: true, scope: 'all' }
    : { allowed: false };

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
