import {
  hashMaintenanceSecret,
  isBypassSecret,
  parseMaintenanceState,
} from './maintenance-state';
import type { MaintenanceState } from './maintenance-state';

const state = (secret: string | null): MaintenanceState => ({
  secretHash: secret === null ? null : hashMaintenanceSecret(secret),
  retryAfterSeconds: 30,
  message: null,
  startedAt: '2026-10-21T10:00:00.000Z',
});

describe('maintenance state', () => {
  it('accepts the secret it was started with and nothing else', () => {
    expect(isBypassSecret(state('open-sesame'), 'open-sesame')).toBe(true);
    expect(isBypassSecret(state('open-sesame'), 'open-sesame ')).toBe(false);
    expect(isBypassSecret(state('open-sesame'), '')).toBe(false);
    expect(isBypassSecret(state('open-sesame'), undefined)).toBe(false);
  });

  it('lets nobody through when no secret was set', () => {
    expect(isBypassSecret(state(null), 'anything')).toBe(false);
    expect(isBypassSecret(state(null), '')).toBe(false);
  });

  it('stores a hash, never the secret itself', () => {
    expect(state('open-sesame').secretHash).not.toContain('open-sesame');
  });

  it('reads nothing as not in maintenance', () => {
    expect(parseMaintenanceState(null)).toBeNull();
    expect(parseMaintenanceState('42')).toBeNull();
  });

  it('falls back to a usable Retry-After when the stored one is malformed', () => {
    const parsed = parseMaintenanceState(
      JSON.stringify({ retryAfterSeconds: -4 }),
    );

    expect(parsed?.retryAfterSeconds).toBe(60);
    expect(parsed?.secretHash).toBeNull();
  });
});
