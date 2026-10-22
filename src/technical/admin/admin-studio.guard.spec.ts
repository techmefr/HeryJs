import { ExecutionContext } from '@nestjs/common';
import { env } from '#technical/config/env';
import { heryConfig } from '#technical/config/hery-config';
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
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = env as unknown as Record<string, string | undefined>;
  const names = [
    'ADMIN_STUDIO_ENABLED',
    'ADMIN_STUDIO_ALLOWED_IPS',
    'ADMIN_STUDIO_REQUIRE_2FA',
    'PLATFORM_OPERATOR_IDS',
  ];
  const savedEnv = Object.fromEntries(names.map((n) => [n, mutableEnv[n]]));

  const configure = (settings: Record<string, string | undefined>) => {
    for (const name of names) {
      mutableEnv[name] = savedEnv[name];
    }

    for (const [key, value] of Object.entries(settings)) {
      if (key === 'NODE_ENV') {
        process.env.NODE_ENV = value;
      } else {
        mutableEnv[key] = value;
      }
    }
  };

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    configure({});
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

    it('narrows to the platform operator in production', () => {
      configure({ NODE_ENV: 'production' });

      expect(canUseAdminStudio(subjectOf(user(null))).allowed).toBe(false);
      expect(canUseAdminStudio(subjectOf(user('member'))).allowed).toBe(false);
      expect(canUseAdminStudio(subjectOf(user('admin'))).allowed).toBe(false);

      configure({ NODE_ENV: 'production', PLATFORM_OPERATOR_IDS: 'user-1' });

      expect(canUseAdminStudio(subjectOf(user(null))).allowed).toBe(true);
    });

    describe("under admin.studioAccess: 'tenant-admin'", () => {
      const originalAdmin = heryConfig.admin;

      afterEach(() => {
        heryConfig.admin = originalAdmin;
      });

      it('also lets a tenant admin in, and still not a member', () => {
        heryConfig.admin = { studioAccess: 'tenant-admin' };
        configure({ NODE_ENV: 'production' });

        expect(canUseAdminStudio(subjectOf(user('admin'))).allowed).toBe(true);
        expect(canUseAdminStudio(subjectOf(user('member'))).allowed).toBe(
          false,
        );
        expect(canUseAdminStudio(subjectOf(user(null))).allowed).toBe(false);
      });

      it("keeps the operator alone under an explicit 'operator'", () => {
        heryConfig.admin = { studioAccess: 'operator' };
        configure({ NODE_ENV: 'production' });

        expect(canUseAdminStudio(subjectOf(user('admin'))).allowed).toBe(false);
      });
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
