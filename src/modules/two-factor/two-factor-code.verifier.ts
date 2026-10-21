import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { matchesRecoveryCode } from './recovery-code';
import { decryptSecret } from './secret-cipher';
import { base32Decode, matchStep } from './totp';
import { InvalidTwoFactorCodeException } from './invalid-two-factor-code.exception';
import { MS_PER_SECOND } from './two-factor.constants';
import { twoFactorEnv } from './two-factor.env';
import { TwoFactorLockedException } from './two-factor-locked.exception';

export interface VerifiableEnrolment {
  id: string;
  userId: string;
  secret: string;
  lockedUntil: Date | null;
}

@Injectable()
export class TwoFactorCodeVerifier {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async assertTotp(
    enrolment: VerifiableEnrolment,
    code: string,
  ): Promise<void> {
    const attempts = await this.reserveAttempt(enrolment);
    const step = matchStep(
      base32Decode(decryptSecret(enrolment.secret)),
      code,
      Date.now(),
      twoFactorEnv().TWO_FACTOR_DRIFT_WINDOW,
    );

    if (step === null) {
      return this.failWith(enrolment, attempts);
    }

    const claimed = await this.prisma.twoFactorEnrolment.updateMany({
      where: {
        id: enrolment.id,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
      },
      data: { lastUsedStep: step, failedAttempts: 0, lockedUntil: null },
    });

    if (claimed.count === 0) {
      return this.failWith(enrolment, attempts);
    }
  }

  async assertRecoveryCode(
    enrolment: VerifiableEnrolment,
    code: string,
  ): Promise<void> {
    const attempts = await this.reserveAttempt(enrolment);
    const candidates = await this.prisma.twoFactorRecoveryCode.findMany({
      where: { userId: enrolment.userId, usedAt: null },
      select: { id: true, codeHash: true },
    });
    const outcomes = await Promise.all(
      candidates.map((candidate) =>
        matchesRecoveryCode(code, candidate.codeHash),
      ),
    );
    const matchIndex = outcomes.findIndex((isMatch) => isMatch);
    const match = matchIndex === -1 ? undefined : candidates[matchIndex];

    if (match === undefined) {
      return this.failWith(enrolment, attempts);
    }

    const claimed = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: new Date(Date.now()) },
    });

    if (claimed.count === 0) {
      return this.failWith(enrolment, attempts);
    }

    await this.prisma.twoFactorEnrolment.update({
      where: { id: enrolment.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  private async reserveAttempt(
    enrolment: VerifiableEnrolment,
  ): Promise<number> {
    const env = twoFactorEnv();

    if (enrolment.lockedUntil !== null) {
      const remainingMs = enrolment.lockedUntil.getTime() - Date.now();

      if (remainingMs > 0) {
        throw new TwoFactorLockedException(
          Math.ceil(remainingMs / MS_PER_SECOND),
        );
      }

      await this.prisma.twoFactorEnrolment.update({
        where: { id: enrolment.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    }

    const reserved = await this.prisma.twoFactorEnrolment.update({
      where: { id: enrolment.id },
      data: { failedAttempts: { increment: 1 } },
    });

    if (reserved.failedAttempts > env.TWO_FACTOR_MAX_FAILURES) {
      throw new TwoFactorLockedException(env.TWO_FACTOR_LOCK_SECONDS);
    }

    return reserved.failedAttempts;
  }

  private async failWith(
    enrolment: VerifiableEnrolment,
    attempts: number,
  ): Promise<never> {
    const env = twoFactorEnv();

    if (attempts < env.TWO_FACTOR_MAX_FAILURES) {
      throw new InvalidTwoFactorCodeException();
    }

    await this.prisma.twoFactorEnrolment.update({
      where: { id: enrolment.id },
      data: {
        lockedUntil: new Date(
          Date.now() + env.TWO_FACTOR_LOCK_SECONDS * MS_PER_SECOND,
        ),
      },
    });

    throw new TwoFactorLockedException(env.TWO_FACTOR_LOCK_SECONDS);
  }
}
