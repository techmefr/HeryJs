import type { ModuleDefinition } from 'heryjs';

const TWO_FACTOR_MODELS = `
/// @hery.tenantScoped
model TwoFactorEnrolment {
  id             String    @id @default(cuid())
  tenantId       String
  userId         String    @unique
  secret         String
  confirmedAt    DateTime?
  lastUsedStep   Int?
  failedAttempts Int       @default(0)
  lockedUntil    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

/// @hery.tenantScoped
model TwoFactorRecoveryCode {
  id        String    @id @default(cuid())
  tenantId  String
  userId    String
  codeHash  String
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId])
}

/// @hery.tenantScoped
model TwoFactorRoleRequirement {
  id        String   @id @default(cuid())
  tenantId  String
  role      String
  createdAt DateTime @default(now())

  @@unique([tenantId, role])
}

/// @hery.tenantScoped
model TwoFactorVerifiedSession {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId])
}
`;

export default {
  name: 'two-factor',
  description:
    'Time-based one-time passwords: an enrolment that only counts once a first code is verified, a second-factor check on the session, hashed single-use recovery codes, and an admin-set requirement per role.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(TWO_FACTOR_MODELS);
    context.addModelFields('User', [
      '  twoFactorEnrolment      TwoFactorEnrolment?',
      '  twoFactorRecoveryCodes  TwoFactorRecoveryCode[]',
      '  twoFactorVerifiedSessions TwoFactorVerifiedSession[]',
    ]);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_two_factor"',
      'Import "TwoFactorModule" into src/app.module.ts',
      'Set TWO_FACTOR_ENCRYPTION_KEY to 64 hex characters (openssl rand -hex 32): it encrypts every TOTP secret at rest and is refused in production while it is still the development default',
      'Put TwoFactorGuard after SessionGuard on every route that must not be reachable before the second factor: @UseGuards(SessionGuard, TwoFactorGuard, CapabilitiesGuard)',
      'POST /two-factor/enrolment, then POST /two-factor/enrolment/confirm with a first code; the recovery codes come back once, on that confirmation',
      'After login, an enrolled user calls POST /two-factor/verify with a code or a recovery code before any route behind TwoFactorGuard answers',
      'An admin requires it for a role with PUT /two-factor/requirements/:role',
    ]);
  },
} satisfies ModuleDefinition;
