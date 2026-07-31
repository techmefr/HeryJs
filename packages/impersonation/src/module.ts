import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';
import {
  patchExactStrings,
  patchModelFields,
} from '../../../cli/lib/schema-patch';

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src';

const SCHEMA_FILE = 'prisma/schema.prisma';
const BETTER_AUTH_INSTANCE_FILE = 'src/technical/auth/better-auth.instance.ts';
const AUTH_TYPES_FILE = 'src/technical/auth/auth.types.ts';
const SESSION_AUTH_PROVIDER_FILE =
  'src/technical/auth/session-auth.provider.ts';
const CAPABILITIES_TYPES_FILE =
  'src/technical/capabilities/capabilities.types.ts';
const CAPABILITIES_SUBJECT_FILE = 'src/technical/capabilities/subject.ts';

registerModule({
  name: 'impersonation',
  description:
    "Let an admin act as another user for support, without ever leaving the tenant boundary or the audit trail: a bearer token for the target user, minted from the admin's own, that never touches the admin's original session.",
  install() {
    copyRuntime(RUNTIME_DIR, DEST_DIR);

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
