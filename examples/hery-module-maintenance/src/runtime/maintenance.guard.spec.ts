import type { ExecutionContext } from '@nestjs/common';
import { MaintenanceGuard } from './maintenance.guard';
import { MaintenanceException } from './maintenance.exception';

function contextFor(role: string | null): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role === null ? undefined : { role } }),
    }),
  } as unknown as ExecutionContext;
}

const guard = new MaintenanceGuard();

afterEach(() => {
  delete process.env.MAINTENANCE_ENABLED;
});

describe('the maintenance guard', () => {
  it('lets everyone through when the flag is unset', () => {
    expect(guard.canActivate(contextFor(null))).toBe(true);
  });

  it('refuses a caller while maintenance is on', () => {
    process.env.MAINTENANCE_ENABLED = 'true';

    expect(() => guard.canActivate(contextFor('member'))).toThrow(
      MaintenanceException,
    );
  });

  it('lets an admin through while maintenance is on', () => {
    process.env.MAINTENANCE_ENABLED = 'true';

    expect(guard.canActivate(contextFor('admin'))).toBe(true);
  });

  // Half-closing an application because a flag was spelled differently is
  // worse than either state, so anything but the exact string leaves it up.
  it.each(['1', 'yes', 'TRUE', 'false', ''])(
    'leaves the app up for MAINTENANCE_ENABLED=%p',
    (value) => {
      process.env.MAINTENANCE_ENABLED = value;

      expect(guard.canActivate(contextFor('member'))).toBe(true);
    },
  );

  it('answers 503 rather than a generic failure', () => {
    expect(new MaintenanceException().getStatus()).toBe(503);
    expect(new MaintenanceException().key).toBe('maintenance.enabled');
  });
});
