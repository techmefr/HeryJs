import { CapabilitiesService } from './capabilities.service';
import { CapabilityRecord, CapabilitySubject } from './capabilities.types';

describe('CapabilitiesService', () => {
  const service = new CapabilitiesService();

  const owner: CapabilitySubject = { id: 'user-1', teamIds: ['team-a'] };
  const stranger: CapabilitySubject = { id: 'user-2', teamIds: ['team-b'] };

  const ownedRecord: CapabilityRecord = { ownerId: 'user-1', teamId: 'team-a' };

  it('denies everyone under the none preset', () => {
    expect(service.resolve('none', owner, ownedRecord)).toEqual({
      allowed: false,
    });
    expect(service.resolve('none', stranger, ownedRecord)).toEqual({
      allowed: false,
    });
  });

  it('allows everyone under the all preset', () => {
    expect(service.resolve('all', stranger, ownedRecord)).toEqual({
      allowed: true,
      scope: 'all',
    });
  });

  it('allows only the owner under the own preset', () => {
    expect(service.resolve('own', owner, ownedRecord)).toEqual({
      allowed: true,
      scope: 'own',
    });
    expect(service.resolve('own', stranger, ownedRecord)).toEqual({
      allowed: false,
    });
  });

  it('allows only a teammate under the team preset', () => {
    expect(service.resolve('team', owner, ownedRecord)).toEqual({
      allowed: true,
      scope: 'team',
    });
    expect(service.resolve('team', stranger, ownedRecord)).toEqual({
      allowed: false,
    });
  });

  it('denies the team preset when the record has no team', () => {
    const teamless: CapabilityRecord = { ownerId: 'user-1' };
    expect(service.resolve('team', owner, teamless)).toEqual({
      allowed: false,
    });
  });
});
