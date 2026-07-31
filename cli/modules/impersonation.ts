import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';
import { patchExactStrings, patchModelFields } from '../lib/schema-patch';

const SCHEMA_FILE = 'prisma/schema.prisma';
const BETTER_AUTH_INSTANCE_FILE = 'src/technical/auth/better-auth.instance.ts';
const AUTH_TYPES_FILE = 'src/technical/auth/auth.types.ts';
const SESSION_AUTH_PROVIDER_FILE =
  'src/technical/auth/session-auth.provider.ts';
const CAPABILITIES_TYPES_FILE =
  'src/technical/capabilities/capabilities.types.ts';
const CAPABILITIES_SUBJECT_FILE = 'src/technical/capabilities/subject.ts';

const SELF_EXCEPTION_FILE =
  'src/technical/errors/self-impersonation.exception.ts';
const NOT_IMPERSONATING_EXCEPTION_FILE =
  'src/technical/errors/not-impersonating.exception.ts';
const POLICY_FILE = 'src/modules/impersonation/impersonation.policy.ts';
const SERVICE_FILE = 'src/modules/impersonation/impersonation.service.ts';
const CONTROLLER_FILE = 'src/modules/impersonation/impersonation.controller.ts';
const MODULE_FILE = 'src/modules/impersonation/impersonation.module.ts';

const SELF_EXCEPTION_CONTENT = `import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class SelfImpersonationException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'impersonation.self',
      'You cannot impersonate yourself.',
    );
  }
}
`;

const NOT_IMPERSONATING_EXCEPTION_CONTENT = `import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class NotImpersonatingException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'impersonation.notImpersonating',
      'You are not impersonating anyone.',
    );
  }
}
`;

const POLICY_CONTENT = `import type { PolicyCheck } from '../../technical/capabilities/capability-check';

// Better Auth's own admin() plugin also refuses this server-side (it is the
// only thing granting the "impersonate" permission to a role) -- this gate
// makes that same decision visible to HeryJs's own capability system, so the
// route is authorized the same way every other route in the framework is.
export const canImpersonate: PolicyCheck = (subject) =>
  subject.role === 'admin' ? { allowed: true, scope: 'all' } : { allowed: false };
`;

const SERVICE_CONTENT = `import { Inject, Injectable } from '@nestjs/common';
import { writeAuditLog } from '../../technical/audit/audit-log';
import {
  authPrismaClient,
  getAuthContext,
} from '../../technical/auth/better-auth.instance';
import type { AuthenticatedUser } from '../../technical/auth/auth.types';
import { CapabilityForbiddenException } from '../../technical/errors/capability-forbidden.exception';
import { NotImpersonatingException } from '../../technical/errors/not-impersonating.exception';
import { RecordNotFoundException } from '../../technical/errors/record-not-found.exception';
import { SelfImpersonationException } from '../../technical/errors/self-impersonation.exception';
import { PRISMA_CLIENT } from '../../technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../../technical/prisma/prisma.client';

export interface ImpersonationSession {
  token: string;
  user: { id: string; email: string };
}

/**
 * Better Auth's own impersonation flow is cookie-based: it swaps the session
 * cookie and stashes the admin's original one in a second cookie so it can be
 * restored later. This app is bearer-only and never reads a cookie back, so
 * none of that restore machinery runs -- the target session's token is lifted
 * straight out of the response instead. "Stopping" needs no restore step at
 * all: the admin's original bearer token is never revoked by starting an
 * impersonation, so going back to it is simply a matter of using it again.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async start(
    admin: AuthenticatedUser,
    adminToken: string,
    targetUserId: string,
  ): Promise<ImpersonationSession> {
    if (admin.id === targetUserId) {
      throw new SelfImpersonationException();
    }

    // User is not a tenant-scoped model, so the tenant has to be checked by
    // hand here -- the same shape as TeamsService.addMember, which refuses a
    // cross-tenant grant outright rather than leaving it merely inert.
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, tenantId: true },
    });

    if (!target || target.tenantId !== admin.tenantId) {
      throw new RecordNotFoundException('user');
    }

    const { auth, APIError } = await getAuthContext();
    let result: Awaited<ReturnType<typeof auth.api.impersonateUser>>;

    try {
      result = await auth.api.impersonateUser({
        headers: new Headers({ authorization: \`Bearer \${adminToken}\` }),
        body: { userId: targetUserId },
      });
    } catch (error) {
      // The caller's own role is already checked upstream by
      // @Capability(canImpersonate) -- the only way this still throws is
      // Better Auth's other admin-plugin rule, refusing to impersonate a
      // user who is themselves an admin.
      if (error instanceof APIError) {
        throw new CapabilityForbiddenException({ reason: error.message });
      }
      throw error;
    }

    await writeAuditLog(authPrismaClient, {
      tenantId: admin.tenantId,
      model: 'Impersonation',
      operation: 'start',
      recordId: target.id,
      data: {
        adminId: admin.id,
        targetUserId: target.id,
        targetEmail: target.email,
      },
    });

    return {
      token: result.session.token,
      user: { id: target.id, email: target.email },
    };
  }

  async stop(user: AuthenticatedUser, token: string): Promise<void> {
    if (!user.impersonatedBy) {
      throw new NotImpersonatingException();
    }

    // Deleting the row is enough: it is the only session this token names,
    // and the admin's original session was never touched by starting it.
    await authPrismaClient.session.delete({ where: { token } });

    await writeAuditLog(authPrismaClient, {
      tenantId: user.tenantId,
      model: 'Impersonation',
      operation: 'end',
      recordId: user.id,
      data: { adminId: user.impersonatedBy, targetUserId: user.id },
    });
  }
}
`;

const CONTROLLER_CONTENT = `import {
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Capability } from '../../technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '../../technical/capabilities/capabilities.guard';
import { MissingSessionException } from '../../technical/errors/invalid-session.exception';
import { ok } from '../../technical/http/envelope';
import { SessionGuard } from '../../technical/auth/session.guard';
import type { RequestWithUser } from '../../technical/auth/session.guard';
import { canImpersonate } from './impersonation.policy';
import { ImpersonationService } from './impersonation.service';

// SessionGuard already validated this exact header to build req.user, so
// this can only fail if that guard did not run -- which @UseGuards below
// rules out. Extracting it again rather than threading it through the guard
// keeps SessionGuard's contract (it returns a user, not a token) unchanged.
function bearerToken(req: RequestWithUser): string {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : undefined;

  if (!token) {
    throw new MissingSessionException();
  }

  return token;
}

@Controller('impersonation')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Post(':userId')
  @Capability(canImpersonate)
  async start(@Req() req: RequestWithUser, @Param('userId') userId: string) {
    const session = await this.impersonation.start(
      req.user,
      bearerToken(req),
      userId,
    );

    return ok(session, ['Impersonation session created.']);
  }

  @Delete()
  async stop(@Req() req: RequestWithUser) {
    await this.impersonation.stop(req.user, bearerToken(req));

    return ok(null, ['Impersonation ended.']);
  }
}
`;

const MODULE_CONTENT = `import { Module } from '@nestjs/common';
import { AuthModule } from '../../technical/auth/auth.module';
import { PrismaModule } from '../../technical/prisma/prisma.module';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService],
})
export class ImpersonationModule {}
`;

registerModule({
  name: 'impersonation',
  description:
    "Let an admin act as another user for support, without ever leaving the tenant boundary or the audit trail: a bearer token for the target user, minted from the admin's own, that never touches the admin's original session.",
  install() {
    const files: Record<string, string> = {
      [SELF_EXCEPTION_FILE]: SELF_EXCEPTION_CONTENT,
      [NOT_IMPERSONATING_EXCEPTION_FILE]: NOT_IMPERSONATING_EXCEPTION_CONTENT,
      [POLICY_FILE]: POLICY_CONTENT,
      [SERVICE_FILE]: SERVICE_CONTENT,
      [CONTROLLER_FILE]: CONTROLLER_CONTENT,
      [MODULE_FILE]: MODULE_CONTENT,
    };

    for (const [filePath, content] of Object.entries(files)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

    patchModelFields(SCHEMA_FILE, 'User', [
      '  role          String?',
      '  banned        Boolean  @default(false)',
      '  banReason     String?',
      '  banExpires    DateTime?',
    ]);
    patchModelFields(SCHEMA_FILE, 'Session', ['  impersonatedBy String?']);
    console.log(pc.green(`✔ patched ${SCHEMA_FILE}`));

    patchExactStrings(
      BETTER_AUTH_INSTANCE_FILE,
      [
        [
          "  const { bearer } = await import('better-auth/plugins');",
          "  const { admin, bearer } = await import('better-auth/plugins');",
        ],
        [
          '    plugins: [bearer()],',
          [
            '    plugins: [',
            '      bearer(),',
            '      // Only the "admin" role gets the built-in "impersonate" permission --',
            '      // there is no role-management endpoint here, on purpose (see',
            '      // Teams: roles are a product decision, granted by hand in the',
            '      // database, not a convention HeryJs ships).',
            '      admin({ impersonationSessionDuration: IMPERSONATION_SESSION_SECONDS }),',
            '    ],',
          ].join('\n'),
        ],
        [
          'async function createAuth() {',
          'const IMPERSONATION_SESSION_SECONDS = 30 * 60;\n\nasync function createAuth() {',
        ],
      ],
      'admin(',
    );
    console.log(pc.green(`✔ patched ${BETTER_AUTH_INSTANCE_FILE}`));

    patchExactStrings(
      AUTH_TYPES_FILE,
      [
        [
          '  currentTeamId: string | null;\n}',
          [
            '  currentTeamId: string | null;',
            '  role: string | null;',
            '  // Set only while the caller is inside an impersonation session, to the id',
            '  // of the admin who started it. Never trust it from anywhere but the',
            "  // session row itself -- see TenantMiddleware's own comment on why nothing",
            '  // client-supplied is trusted for identity.',
            '  impersonatedBy: string | null;',
            '}',
          ].join('\n'),
        ],
      ],
      'impersonatedBy: string | null;',
    );
    console.log(pc.green(`✔ patched ${AUTH_TYPES_FILE}`));

    patchExactStrings(
      SESSION_AUTH_PROVIDER_FILE,
      [
        [
          [
            'async function authenticate(user: {',
            '  id: string;',
            '  email: string;',
            '}): Promise<AuthenticatedUser> {',
          ].join('\n'),
          [
            'async function authenticate(',
            '  user: { id: string; email: string },',
            '  impersonatedBy: string | null = null,',
            '): Promise<AuthenticatedUser> {',
          ].join('\n'),
        ],
        [
          '      currentTeamId: true,\n      memberships:',
          '      currentTeamId: true,\n      role: true,\n      memberships:',
        ],
        [
          '        : (teamIds[0] ?? null),\n  };',
          '        : (teamIds[0] ?? null),\n    role: stored.role,\n    impersonatedBy,\n  };',
        ],
        [
          '    return await authenticate(session.user);',
          [
            '    const impersonatedBy =',
            "      'impersonatedBy' in session.session",
            '        ? ((session.session.impersonatedBy as string | null) ?? null)',
            '        : null;',
            '',
            '    return await authenticate(session.user, impersonatedBy);',
          ].join('\n'),
        ],
      ],
      'impersonatedBy,\n  };',
    );
    console.log(pc.green(`✔ patched ${SESSION_AUTH_PROVIDER_FILE}`));

    patchExactStrings(
      CAPABILITIES_TYPES_FILE,
      [
        [
          '  currentTeamId: string | null;\n}',
          [
            '  currentTeamId: string | null;',
            '  role: string | null;',
            '}',
          ].join('\n'),
        ],
      ],
      'role: string | null;',
    );
    console.log(pc.green(`✔ patched ${CAPABILITIES_TYPES_FILE}`));

    patchExactStrings(
      CAPABILITIES_SUBJECT_FILE,
      [
        [
          '    currentTeamId: user.currentTeamId,\n  };',
          '    currentTeamId: user.currentTeamId,\n    role: user.role,\n  };',
        ],
      ],
      'role: user.role,',
    );
    console.log(pc.green(`✔ patched ${CAPABILITIES_SUBJECT_FILE}`));

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(`  1. Run "pnpm hery migrate --name add_impersonation"`);
    console.log(
      `  2. Import ${pc.bold('ImpersonationModule')} into src/app.module.ts`,
    );
    console.log(
      `  3. There is no role-management endpoint, by design (see Teams): promote a user to admin by hand, e.g. UPDATE "User" SET role = 'admin' WHERE email = '...'`,
    );
    console.log(
      `  4. POST /impersonation/:userId as an admin to get a bearer token for the target; DELETE /impersonation with that token to end it and go back to using your own`,
    );
  },
});
