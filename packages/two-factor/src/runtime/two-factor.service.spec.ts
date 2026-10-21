import type { AuthenticatedUser } from '#kernel/auth/auth.types';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { decryptSecret } from './secret-cipher';
import { base32Decode, hotp, stepAt } from './totp';
import { InvalidTwoFactorCodeException } from './invalid-two-factor-code.exception';
import { TwoFactorAlreadyEnrolledException } from './two-factor-already-enrolled.exception';
import { TwoFactorCodeVerifier } from './two-factor-code.verifier';
import { TwoFactorEnrolmentRequiredException } from './two-factor-enrolment-required.exception';
import { TwoFactorLockedException } from './two-factor-locked.exception';
import { TwoFactorNotEnrolledException } from './two-factor-not-enrolled.exception';
import { TwoFactorRequiredByRoleException } from './two-factor-required-by-role.exception';
import { TwoFactorRequiredException } from './two-factor-required.exception';
import { TwoFactorRequirementService } from './two-factor-requirement.service';
import { TwoFactorSessionService } from './two-factor-session.service';
import { TwoFactorService } from './two-factor.service';
import { RECOVERY_CODE_COUNT } from './two-factor.constants';
import { twoFactorEnv } from './two-factor.env';

type Row = Record<string, unknown>;
type Operator = { lt?: number; gt?: number; lte?: number; increment?: number };

function isOperator(value: unknown): value is Operator {
  return (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    ('lt' in value || 'gt' in value || 'lte' in value || 'increment' in value)
  );
}

function comparable(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number(value);
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Row[]).some((branch) => matches(row, branch));
    }

    if (key === 'tenantId_role') {
      return matches(row, condition as Row);
    }

    const value = row[key];

    if (isOperator(condition)) {
      if (value === null || value === undefined) {
        return false;
      }
      if (condition.lt !== undefined) {
        return comparable(value) < comparable(condition.lt);
      }
      if (condition.gt !== undefined) {
        return comparable(value) > comparable(condition.gt);
      }
      return comparable(value) <= comparable(condition.lte);
    }

    return value === condition;
  });
}

function applyData(row: Row, data: Row): void {
  for (const [key, change] of Object.entries(data)) {
    const increment = (change as Operator | null)?.increment;

    if (typeof increment === 'number') {
      row[key] = (row[key] as number) + increment;
    } else {
      row[key] = change;
    }
  }
}

class FakeTable {
  rows: Row[] = [];
  private sequence = 0;

  constructor(
    private readonly name: string,
    private readonly defaults: Row,
  ) {}

  private insert(data: Row): Row {
    this.sequence += 1;
    const row = {
      id: `${this.name}-${this.sequence}`,
      ...this.defaults,
      ...data,
    };
    this.rows.push(row);

    return row;
  }

  findUnique = ({ where }: { where: Row }) =>
    Promise.resolve(this.rows.find((row) => matches(row, where)) ?? null);

  findFirst = this.findUnique;

  findMany = ({ where }: { where?: Row }) =>
    Promise.resolve(this.rows.filter((row) => matches(row, where ?? {})));

  count = ({ where }: { where?: Row } = {}) =>
    Promise.resolve(
      this.rows.filter((row) => matches(row, where ?? {})).length,
    );

  createMany = ({ data }: { data: Row[] }) => {
    data.forEach((entry) => this.insert(entry));

    return Promise.resolve({ count: data.length });
  };

  update = async ({ where, data }: { where: Row; data: Row }) => {
    const row = await this.findUnique({ where });

    if (row === null) {
      throw new Error('no row to update');
    }

    applyData(row, data);

    return { ...row };
  };

  updateMany = ({ where, data }: { where: Row; data: Row }) => {
    const targets = this.rows.filter((row) => matches(row, where));
    targets.forEach((row) => applyData(row, data));

    return Promise.resolve({ count: targets.length });
  };

  upsert = async ({
    where,
    create,
    update,
  }: {
    where: Row;
    create: Row;
    update: Row;
  }) => {
    const row = await this.findUnique({ where });

    if (row === null) {
      return this.insert(create);
    }

    applyData(row, update);

    return row;
  };

  deleteMany = ({ where }: { where: Row }) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matches(row, where));

    return Promise.resolve({ count: before - this.rows.length });
  };
}

interface Harness {
  service: TwoFactorService;
  enrolments: FakeTable;
  codes: FakeTable;
  sessions: FakeTable;
  requirements: FakeTable;
}

function build(): Harness {
  const enrolments = new FakeTable('enrolment', {
    confirmedAt: null,
    lastUsedStep: null,
    failedAttempts: 0,
    lockedUntil: null,
  });
  const codes = new FakeTable('code', { usedAt: null });
  const sessions = new FakeTable('session', {});
  const requirements = new FakeTable('requirement', {});
  const prisma = {
    twoFactorEnrolment: enrolments,
    twoFactorRecoveryCode: codes,
    twoFactorVerifiedSession: sessions,
    twoFactorRoleRequirement: requirements,
  } as unknown as TenantScopedPrismaClient;

  return {
    service: new TwoFactorService(
      prisma,
      new TwoFactorCodeVerifier(prisma),
      new TwoFactorSessionService(prisma),
      new TwoFactorRequirementService(prisma),
    ),
    enrolments,
    codes,
    sessions,
    requirements,
  };
}

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'ada@example.test',
  tenantId: 'tenant-1',
  teamIds: [],
  currentTeamId: null,
  role: null,
  impersonatedBy: null,
};
const TOKEN = 'session-token-1';
const OTHER_TOKEN = 'session-token-2';
const START = Date.UTC(2026, 0, 1, 12, 0, 0);
const STEP_MS = 30_000;
const WRONG_CODE = '000000';

let now = START;

function codeFor(harness: Harness, atMs: number = now): string {
  const stored = harness.enrolments.rows[0]?.secret as string;

  return hotp(base32Decode(decryptSecret(stored)), stepAt(atMs));
}

async function enrolled(harness: Harness): Promise<string[]> {
  await harness.service.beginEnrolment(user);
  const recoveryCodes = await harness.service.confirmEnrolment(
    user,
    TOKEN,
    codeFor(harness),
  );
  now += STEP_MS;

  return recoveryCodes;
}

function firstOf(codes: string[]): string {
  const [first] = codes;

  if (first === undefined) {
    throw new Error('Expected at least one recovery code.');
  }

  return first;
}

describe('TwoFactorService', () => {
  beforeEach(() => {
    now = START;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('enrolment', () => {
    it('hands back a secret and an otpauth url, and stores the secret encrypted', async () => {
      const harness = build();
      const start = await harness.service.beginEnrolment(user);

      expect(start.otpauthUrl).toContain(`secret=${start.secret}`);
      expect(harness.enrolments.rows[0]?.secret).not.toContain(start.secret);
    });

    it('is not complete until a first code has been verified', async () => {
      const harness = build();
      await harness.service.beginEnrolment(user);

      const status = await harness.service.status(user, TOKEN);

      expect(status.isEnrolled).toBe(false);
      await expect(harness.service.assertSatisfied(user, TOKEN)).resolves.toBe(
        undefined,
      );
      await expect(
        harness.service.verify(user, TOKEN, { code: codeFor(harness) }),
      ).rejects.toBeInstanceOf(TwoFactorNotEnrolledException);
    });

    it('refuses a wrong first code and stays unconfirmed', async () => {
      const harness = build();
      await harness.service.beginEnrolment(user);

      await expect(
        harness.service.confirmEnrolment(user, TOKEN, WRONG_CODE),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
      expect(harness.enrolments.rows[0]?.confirmedAt).toBeNull();
      expect(harness.codes.rows).toHaveLength(0);
    });

    it('confirms on a first valid code, issues recovery codes and verifies the session', async () => {
      const harness = build();
      const recoveryCodes = await enrolled(harness);

      expect(recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
      expect(harness.enrolments.rows[0]?.confirmedAt).not.toBeNull();
      expect((await harness.service.status(user, TOKEN)).isVerified).toBe(true);
    });

    it('cannot be started again once confirmed', async () => {
      const harness = build();
      await enrolled(harness);

      await expect(harness.service.beginEnrolment(user)).rejects.toBeInstanceOf(
        TwoFactorAlreadyEnrolledException,
      );
    });

    it('restarting an unconfirmed enrolment replaces its secret', async () => {
      const harness = build();
      const first = await harness.service.beginEnrolment(user);
      const second = await harness.service.beginEnrolment(user);

      expect(second.secret).not.toBe(first.secret);
      expect(harness.enrolments.rows).toHaveLength(1);
    });

    it('stores recovery codes hashed, never in the clear', async () => {
      const harness = build();
      const recoveryCodes = await enrolled(harness);
      const stored = harness.codes.rows.map((row) => row.codeHash as string);

      expect(stored).toHaveLength(RECOVERY_CODE_COUNT);
      recoveryCodes.forEach((code) => {
        stored.forEach((hash) => expect(hash).not.toContain(code));
      });
    });
  });

  describe('verification', () => {
    it('keeps a session out until it has verified, then lets it through', async () => {
      const harness = build();
      await enrolled(harness);

      await expect(
        harness.service.assertSatisfied(user, OTHER_TOKEN),
      ).rejects.toBeInstanceOf(TwoFactorRequiredException);

      await harness.service.verify(user, OTHER_TOKEN, {
        code: codeFor(harness),
      });

      await expect(
        harness.service.assertSatisfied(user, OTHER_TOKEN),
      ).resolves.toBeUndefined();
    });

    it('does not let one session vouch for another', async () => {
      const harness = build();
      await enrolled(harness);

      await expect(
        harness.service.assertSatisfied(user, OTHER_TOKEN),
      ).rejects.toBeInstanceOf(TwoFactorRequiredException);
    });

    it('stores only a hash of the session token', async () => {
      const harness = build();
      await enrolled(harness);

      expect(JSON.stringify(harness.sessions.rows)).not.toContain(TOKEN);
    });

    it('forgets a verified session once it expires', async () => {
      const harness = build();
      await enrolled(harness);
      now += twoFactorEnv().TWO_FACTOR_SESSION_SECONDS * 1000 + 1;

      await expect(
        harness.service.assertSatisfied(user, TOKEN),
      ).rejects.toBeInstanceOf(TwoFactorRequiredException);
    });

    it('rejects a code that was already used, even inside the drift window', async () => {
      const harness = build();
      await enrolled(harness);
      const code = codeFor(harness);

      await harness.service.verify(user, OTHER_TOKEN, { code });

      await expect(
        harness.service.verify(user, 'third-token', { code }),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
    });

    it('rejects an older code once a newer one has been used', async () => {
      const harness = build();
      await enrolled(harness);
      const older = codeFor(harness, now - STEP_MS);

      await harness.service.verify(user, OTHER_TOKEN, {
        code: codeFor(harness),
      });

      await expect(
        harness.service.verify(user, 'third-token', { code: older }),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
    });

    it('tolerates one step of clock drift but not two', async () => {
      const harness = build();
      await enrolled(harness);

      await expect(
        harness.service.verify(user, OTHER_TOKEN, {
          code: codeFor(harness, now - 2 * STEP_MS),
        }),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);

      await expect(
        harness.service.verify(user, OTHER_TOKEN, {
          code: codeFor(harness, now + STEP_MS),
        }),
      ).resolves.toBeUndefined();
    });

    it('locks after repeated wrong codes and refuses even a right one until the lock lifts', async () => {
      const harness = build();
      await enrolled(harness);
      const { TWO_FACTOR_MAX_FAILURES, TWO_FACTOR_LOCK_SECONDS } =
        twoFactorEnv();

      for (let attempt = 1; attempt < TWO_FACTOR_MAX_FAILURES; attempt += 1) {
        await expect(
          harness.service.verify(user, OTHER_TOKEN, { code: WRONG_CODE }),
        ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
      }

      await expect(
        harness.service.verify(user, OTHER_TOKEN, { code: WRONG_CODE }),
      ).rejects.toBeInstanceOf(TwoFactorLockedException);

      await expect(
        harness.service.verify(user, OTHER_TOKEN, { code: codeFor(harness) }),
      ).rejects.toBeInstanceOf(TwoFactorLockedException);

      now += TWO_FACTOR_LOCK_SECONDS * 1000 + 1;

      await expect(
        harness.service.verify(user, OTHER_TOKEN, { code: codeFor(harness) }),
      ).resolves.toBeUndefined();
    });

    it('bounds a parallel burst of guesses to the failure budget', async () => {
      const harness = build();
      await enrolled(harness);
      const { TWO_FACTOR_MAX_FAILURES } = twoFactorEnv();
      const burst = TWO_FACTOR_MAX_FAILURES + 4;

      const outcomes = await Promise.allSettled(
        Array.from({ length: burst }, () =>
          harness.service.verify(user, OTHER_TOKEN, { code: WRONG_CODE }),
        ),
      );
      const reasons = outcomes.map((outcome): unknown =>
        outcome.status === 'rejected' ? (outcome.reason as unknown) : null,
      );

      expect(
        reasons.filter(
          (reason) => reason instanceof InvalidTwoFactorCodeException,
        ),
      ).toHaveLength(TWO_FACTOR_MAX_FAILURES - 1);
      expect(
        reasons.filter((reason) => reason instanceof TwoFactorLockedException),
      ).toHaveLength(burst - TWO_FACTOR_MAX_FAILURES + 1);
      await expect(
        harness.service.verify(user, OTHER_TOKEN, { code: codeFor(harness) }),
      ).rejects.toBeInstanceOf(TwoFactorLockedException);
    });

    it('resets the failure count after a success', async () => {
      const harness = build();
      await enrolled(harness);

      await expect(
        harness.service.verify(user, OTHER_TOKEN, { code: WRONG_CODE }),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
      await harness.service.verify(user, OTHER_TOKEN, {
        code: codeFor(harness),
      });

      expect(harness.enrolments.rows[0]?.failedAttempts).toBe(0);
    });
  });

  describe('recovery codes', () => {
    it('lets a recovery code stand in for a TOTP code, once', async () => {
      const harness = build();
      const recoveryCode = firstOf(await enrolled(harness));

      await harness.service.verify(user, OTHER_TOKEN, {
        recoveryCode,
      });

      await expect(
        harness.service.verify(user, 'third-token', {
          recoveryCode,
        }),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
      expect(
        harness.codes.rows.filter((row) => row.usedAt !== null),
      ).toHaveLength(1);
    });

    it('accepts a recovery code typed without its dashes', async () => {
      const harness = build();
      const recoveryCode = firstOf(await enrolled(harness));

      await expect(
        harness.service.verify(user, OTHER_TOKEN, {
          recoveryCode: recoveryCode.replaceAll('-', ''),
        }),
      ).resolves.toBeUndefined();
    });

    it('counts wrong recovery codes toward the lockout', async () => {
      const harness = build();
      await enrolled(harness);
      const { TWO_FACTOR_MAX_FAILURES } = twoFactorEnv();

      for (let attempt = 1; attempt < TWO_FACTOR_MAX_FAILURES; attempt += 1) {
        await expect(
          harness.service.verify(user, OTHER_TOKEN, {
            recoveryCode: 'aaaa-bbbb-cccc-dddd',
          }),
        ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
      }

      await expect(
        harness.service.verify(user, OTHER_TOKEN, {
          recoveryCode: 'aaaa-bbbb-cccc-dddd',
        }),
      ).rejects.toBeInstanceOf(TwoFactorLockedException);
    });

    it('replaces every recovery code on regeneration, behind a valid code', async () => {
      const harness = build();
      const oldCode = firstOf(await enrolled(harness));

      await expect(
        harness.service.regenerateRecoveryCodes(user, WRONG_CODE),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);

      const fresh = await harness.service.regenerateRecoveryCodes(
        user,
        codeFor(harness),
      );
      now += STEP_MS;

      expect(fresh).toHaveLength(RECOVERY_CODE_COUNT);
      expect(harness.codes.rows).toHaveLength(RECOVERY_CODE_COUNT);
      await expect(
        harness.service.verify(user, OTHER_TOKEN, {
          recoveryCode: oldCode,
        }),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);
    });
  });

  describe('disabling', () => {
    it('removes the enrolment, its codes and its verified sessions behind a valid code', async () => {
      const harness = build();
      await enrolled(harness);

      await expect(
        harness.service.disable(user, WRONG_CODE),
      ).rejects.toBeInstanceOf(InvalidTwoFactorCodeException);

      await harness.service.disable(user, codeFor(harness));

      expect(harness.enrolments.rows).toHaveLength(0);
      expect(harness.codes.rows).toHaveLength(0);
      expect(harness.sessions.rows).toHaveLength(0);
      await expect(
        harness.service.assertSatisfied(user, OTHER_TOKEN),
      ).resolves.toBeUndefined();
    });

    it('refuses to turn off a factor the role requires', async () => {
      const harness = build();
      const adminUser = { ...user, role: 'admin' };
      harness.requirements.rows.push({
        id: 'requirement-1',
        tenantId: user.tenantId,
        role: 'admin',
      });
      await harness.service.beginEnrolment(adminUser);
      await harness.service.confirmEnrolment(
        adminUser,
        TOKEN,
        codeFor(harness),
      );
      now += STEP_MS;

      await expect(
        harness.service.disable(adminUser, codeFor(harness)),
      ).rejects.toBeInstanceOf(TwoFactorRequiredByRoleException);
    });
  });

  describe('a role that requires it', () => {
    it('keeps a not-yet-enrolled member of that role out until they enrol', async () => {
      const harness = build();
      const adminUser = { ...user, role: 'admin' };
      harness.requirements.rows.push({
        id: 'requirement-1',
        tenantId: user.tenantId,
        role: 'admin',
      });

      await expect(
        harness.service.assertSatisfied(adminUser, TOKEN),
      ).rejects.toBeInstanceOf(TwoFactorEnrolmentRequiredException);
      await expect(
        harness.service.assertSatisfied(user, TOKEN),
      ).resolves.toBeUndefined();
    });

    it('does not count a half-finished enrolment as being enrolled', async () => {
      const harness = build();
      const adminUser = { ...user, role: 'admin' };
      harness.requirements.rows.push({
        id: 'requirement-1',
        tenantId: user.tenantId,
        role: 'admin',
      });
      await harness.service.beginEnrolment(adminUser);

      await expect(
        harness.service.assertSatisfied(adminUser, TOKEN),
      ).rejects.toBeInstanceOf(TwoFactorEnrolmentRequiredException);
    });
  });
});
