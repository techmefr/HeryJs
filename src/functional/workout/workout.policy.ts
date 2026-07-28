import { Injectable } from '@nestjs/common';
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import {
  CapabilityDecision,
  CapabilitySubject,
} from '../../technical/capabilities/capabilities.types';

export interface WorkoutRecordLike {
  ownerId: string;
}

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
      create: { allowed: true, scope: 'own' },
    };
  }
}
