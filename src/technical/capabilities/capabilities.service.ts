import { Injectable } from '@nestjs/common';
import {
  CapabilityDecision,
  CapabilityRecord,
  CapabilitySubject,
  PermissionPreset,
  ShareAccess,
} from './capabilities.types';
import { resolveCapability } from './resolve-capability';

@Injectable()
export class CapabilitiesService {
  resolve(
    preset: PermissionPreset,
    subject: CapabilitySubject,
    record: CapabilityRecord,
    access?: ShareAccess,
  ): CapabilityDecision {
    return resolveCapability(preset, subject, record, access);
  }
}
