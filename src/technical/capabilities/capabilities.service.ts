import { Injectable } from '@nestjs/common';
import {
  CapabilityDecision,
  CapabilityRecord,
  CapabilitySubject,
  PermissionPreset,
} from './capabilities.types';
import { resolveCapability } from './resolve-capability';

@Injectable()
export class CapabilitiesService {
  resolve(
    preset: PermissionPreset,
    subject: CapabilitySubject,
    record: CapabilityRecord,
  ): CapabilityDecision {
    return resolveCapability(preset, subject, record);
  }
}
