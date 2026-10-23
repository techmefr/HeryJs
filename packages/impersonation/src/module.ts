import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'impersonation',
  description:
    "Let an admin act as another user for support, without ever leaving the tenant boundary or the audit trail: a bearer token for the target user, minted from the admin's own, that never touches the admin's original session.",
  meta: { compatibility: '>=0.0.1' },
  install(context) {
    context.copyRuntime();

    context.addModelFields('User', [
      '  role          String?',
      '  banned        Boolean  @default(false)',
      '  banReason     String?',
      '  banExpires    DateTime?',
    ]);
    context.addModelFields('Session', ['  impersonatedBy String?']);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_impersonation"',
      `Import "ImpersonationModule" into src/app.module.ts`,
      "There is no role-management endpoint, by design (see Teams): promote a user to admin by hand, e.g. UPDATE \"User\" SET role = 'admin' WHERE email = '...'",
      'POST /impersonation/:userId as an admin to get a bearer token for the target; DELETE /impersonation with that token to end it and go back to using your own',
    ]);
  },
} satisfies ModuleDefinition;
