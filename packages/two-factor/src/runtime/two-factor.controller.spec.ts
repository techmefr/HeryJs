import { RATE_LIMIT_BUCKET } from '#kernel/rate-limit/rate-limit.decorator';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorRequirementController } from './two-factor-requirement.controller';

const AUTH_BUCKET = 'auth';

interface ControllerClass {
  prototype: object;
}

function bucketOf(controller: ControllerClass, method: string): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    controller.prototype,
    method,
  )?.value;

  return typeof handler === 'function'
    ? (Reflect.getMetadata(RATE_LIMIT_BUCKET, handler) as unknown)
    : null;
}

describe('two-factor rate limiting', () => {
  it.each(['verify', 'confirmEnrolment', 'regenerateRecoveryCodes', 'disable'])(
    'puts %s, a route that takes a code, in the auth bucket',
    (method) => {
      expect(bucketOf(TwoFactorController, method)).toBe(AUTH_BUCKET);
    },
  );

  it('keeps every other route off the auth bucket', () => {
    expect(bucketOf(TwoFactorController, 'status')).toBe('read');
    expect(bucketOf(TwoFactorController, 'beginEnrolment')).toBe('write');
    expect(bucketOf(TwoFactorRequirementController, 'list')).toBe('read');
    expect(bucketOf(TwoFactorRequirementController, 'require')).toBe('write');
    expect(bucketOf(TwoFactorRequirementController, 'release')).toBe('write');
  });
});
