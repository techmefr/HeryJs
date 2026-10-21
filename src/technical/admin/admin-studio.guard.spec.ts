import { ExecutionContext } from '@nestjs/common';
import { subjectOf } from '#technical/capabilities/subject';
import type { AuthenticatedUser } from '#technical/auth/auth.types';
import {
  AdminStudioFactorGuard,
  AdminStudioGateGuard,
} from './admin-studio.guard';
import { canUseAdminStudio } from './admin-studio.policy';

const mockFindUnique = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('#technical/auth/better-auth.instance', () => ({
  authPrismaClient: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

const findUser = mockFindUnique;

const user = (role: string | null): AuthenticatedUser => ({
  id: 'user-1',
  email: 'a@example.test',
  tenantId: 'default',
  teamIds: [],
  currentTeamId: null,
  role,
  impersonatedBy: null,
});

const contextOf = (request: object): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('admin studio production access', () => {
  const saved = { ...process.env };

  const configure = (settings: Record<string, string | undefined>) => {
    process.env = { ...saved };

    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  afterEach(() => {
    process.env = { ...saved };
    findUser.mockReset();
  });

  describe('gate', () => {
    const gate = new AdminStudioGateGuard();

    it('lets everything through outside production, as /introspect always did', () => {
      configure({ NODE_ENV: 'development' });

      expect(gate.canActivate(contextOf({ ip: '203.0.113.9' }))).toBe(true);
    });

    it('does not exist in production until an operator switches it on', () => {
      configure({ NODE_ENV: 'production', ADMIN_STUDIO_ENABLED: undefined });

      expect(() => gate.canActivate(contextOf({ ip: '127.0.0.1' }))).toThrow(
        'Not Found',
      );
    });

    it.each(['TRUE', '1', 'yes', ' true'])(
      'only reads the exact value "true" as on (%s)',
      (value) => {
        configure({ NODE_ENV: 'production', ADMIN_STUDIO_ENABLED: value });

        expect(() => gate.canActivate(contextOf({ ip: '127.0.0.1' }))).toThrow(
          'Not Found',
        );
      },
    );

    it('answers 404 outside the allowed addresses and accepts an IPv4-mapped peer', () => {
      configure({
        NODE_ENV: 'production',
        ADMIN_STUDIO_ENABLED: 'true',
        ADMIN_STUDIO_ALLOWED_IPS: '10.0.0.5, 10.0.0.6',
      });

      expect(() => gate.canActivate(contextOf({ ip: '203.0.113.9' }))).toThrow(
        'Not Found',
      );
      expect(gate.canActivate(contextOf({ ip: '::ffff:10.0.0.6' }))).toBe(true);
    });

    it('cannot be talked out of the check by a request header or a dev flag', () => {
      configure({
        NODE_ENV: 'production',
        ADMIN_STUDIO_ENABLED: 'true',
        ADMIN_STUDIO_ALLOWED_IPS: '10.0.0.5',
        DEV_TOKEN_ENABLED: 'true',
        ALLOW_DEV: 'true',
      });

      const spoofed = {
        ip: '203.0.113.9',
        headers: {
          'x-forwarded-for': '10.0.0.5',
          'x-dev': 'true',
          'x-admin-studio': 'enabled',
        },
        header: () => 'true',
      };

      expect(() => gate.canActivate(contextOf(spoofed))).toThrow('Not Found');
    });
  });

  describe('capability', () => {
    it('is open to any signed-in developer outside production', () => {
      configure({ NODE_ENV: 'test' });

      expect(canUseAdminStudio(subjectOf(user(null))).allowed).toBe(true);
    });

    it('narrows to the platform admin in production', () => {
      configure({ NODE_ENV: 'production' });

      expect(canUseAdminStudio(subjectOf(user(null))).allowed).toBe(false);
      expect(canUseAdminStudio(subjectOf(user('member'))).allowed).toBe(false);
      expect(canUseAdminStudio(subjectOf(user('admin'))).allowed).toBe(true);
    });
  });

  describe('second factor', () => {
    const guard = new AdminStudioFactorGuard();
    const request = { user: user('admin') };

    it('is not asked for unless the operator required it', async () => {
      configure({ NODE_ENV: 'production', ADMIN_STUDIO_REQUIRE_2FA: 'false' });

      await expect(guard.canActivate(contextOf(request))).resolves.toBe(true);
      expect(findUser).not.toHaveBeenCalled();
    });

    it('refuses an admin with no factor enrolled', async () => {
      configure({ NODE_ENV: 'production', ADMIN_STUDIO_REQUIRE_2FA: 'true' });
      findUser.mockResolvedValue({ twoFactorEnabled: false });

      await expect(guard.canActivate(contextOf(request))).rejects.toThrow(
        'admin.twoFactorRequired',
      );
    });

    it('accepts an admin who has one', async () => {
      configure({ NODE_ENV: 'production', ADMIN_STUDIO_REQUIRE_2FA: 'true' });
      findUser.mockResolvedValue({ twoFactorEnabled: true });

      await expect(guard.canActivate(contextOf(request))).resolves.toBe(true);
    });
  });
});
