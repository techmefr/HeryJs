import { Injectable } from '@nestjs/common';
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import { resolveCapability } from '../../technical/capabilities/resolve-capability';
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

export const canDeleteWorkout: PolicyCheck<WorkoutRecordLike> =
  canUpdateWorkout;

export const canViewWorkout: PolicyCheck<WorkoutRecordLike> = canUpdateWorkout;

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

  metaCapabilities(): Record<'create', CapabilityDecision> {
    return {
      create: canCreateWorkout({ id: '', teamIds: [] }),
    };
  }
}
