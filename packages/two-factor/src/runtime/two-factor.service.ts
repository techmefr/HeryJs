import { Inject, Injectable } from '@nestjs/common';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '@heryjs/core/database';
import type { AuthenticatedUser } from '@heryjs/core/auth';
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-code';
import { encryptSecret } from './secret-cipher';
import { generateSecret, otpauthUrl } from './totp';
import { TwoFactorAlreadyEnrolledException } from './two-factor-already-enrolled.exception';
import { TwoFactorCodeVerifier } from './two-factor-code.verifier';
import { TwoFactorEnrolmentRequiredException } from './two-factor-enrolment-required.exception';
import { TwoFactorNotEnrolledException } from './two-factor-not-enrolled.exception';
import { TwoFactorRequiredByRoleException } from './two-factor-required-by-role.exception';
import { TwoFactorRequiredException } from './two-factor-required.exception';
import { TwoFactorRequirementService } from './two-factor-requirement.service';
import { TwoFactorSessionService } from './two-factor-session.service';
import { twoFactorEnv } from './two-factor.env';
import type { VerifyInput } from './two-factor.schemas';

export interface TwoFactorEnrolmentStart {
  secret: string;
  otpauthUrl: string;
}

export interface TwoFactorStatus {
  isEnrolled: boolean;
  isRequired: boolean;
  isVerified: boolean;
  remainingRecoveryCodes: number;
}

interface StoredEnrolment {
  id: string;
  userId: string;
  secret: string;
  confirmedAt: Date | null;
  lockedUntil: Date | null;
}

@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly verifier: TwoFactorCodeVerifier,
    private readonly sessions: TwoFactorSessionService,
    private readonly requirements: TwoFactorRequirementService,
  ) {}

  async status(
    user: AuthenticatedUser,
    token: string,
  ): Promise<TwoFactorStatus> {
    const enrolment = await this.findEnrolment(user.id);
    const isEnrolled = enrolment !== null && enrolment.confirmedAt !== null;
    const [isRequired, isVerified, remainingRecoveryCodes] = await Promise.all([
      this.requirements.isRequiredFor(user.role),
      this.sessions.isVerified(user.id, token),
      isEnrolled ? this.countRecoveryCodes(user.id) : Promise.resolve(0),
    ]);

    return { isEnrolled, isRequired, isVerified, remainingRecoveryCodes };
  }

  async beginEnrolment(
    user: AuthenticatedUser,
  ): Promise<TwoFactorEnrolmentStart> {
    const existing = await this.findEnrolment(user.id);

    if (existing !== null && existing.confirmedAt !== null) {
      throw new TwoFactorAlreadyEnrolledException();
    }

    const secret = generateSecret();
    const encrypted = encryptSecret(secret);

    await this.prisma.twoFactorEnrolment.upsert({
      where: { userId: user.id },
      create: { tenantId: user.tenantId, userId: user.id, secret: encrypted },
      update: {
        secret: encrypted,
        lastUsedStep: null,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    return {
      secret,
      otpauthUrl: otpauthUrl(
        twoFactorEnv().TWO_FACTOR_ISSUER,
        user.email,
        secret,
      ),
    };
  }

  async confirmEnrolment(
    user: AuthenticatedUser,
    token: string,
    code: string,
  ): Promise<string[]> {
    const enrolment = await this.requireEnrolment(user.id);

    if (enrolment.confirmedAt !== null) {
      throw new TwoFactorAlreadyEnrolledException();
    }

    await this.verifier.assertTotp(enrolment, code);

    const confirmed = await this.prisma.twoFactorEnrolment.updateMany({
      where: { id: enrolment.id, confirmedAt: null },
      data: { confirmedAt: new Date(Date.now()) },
    });

    if (confirmed.count === 0) {
      throw new TwoFactorAlreadyEnrolledException();
    }

    const recoveryCodes = await this.replaceRecoveryCodes(user);
    await this.sessions.markVerified(user, token);

    return recoveryCodes;
  }

  async verify(
    user: AuthenticatedUser,
    token: string,
    input: VerifyInput,
  ): Promise<void> {
    const enrolment = await this.requireConfirmedEnrolment(user.id);

    if (input.code !== undefined) {
      await this.verifier.assertTotp(enrolment, input.code);
    } else if (input.recoveryCode !== undefined) {
      await this.verifier.assertRecoveryCode(enrolment, input.recoveryCode);
    }

    await this.sessions.markVerified(user, token);
  }

  async regenerateRecoveryCodes(
    user: AuthenticatedUser,
    code: string,
  ): Promise<string[]> {
    const enrolment = await this.requireConfirmedEnrolment(user.id);

    await this.verifier.assertTotp(enrolment, code);

    return this.replaceRecoveryCodes(user);
  }

  async disable(user: AuthenticatedUser, code: string): Promise<void> {
    const enrolment = await this.requireConfirmedEnrolment(user.id);

    if (await this.requirements.isRequiredFor(user.role)) {
      throw new TwoFactorRequiredByRoleException();
    }

    await this.verifier.assertTotp(enrolment, code);

    await this.prisma.twoFactorRecoveryCode.deleteMany({
      where: { userId: user.id },
    });
    await this.sessions.forgetAll(user.id);
    await this.prisma.twoFactorEnrolment.deleteMany({
      where: { userId: user.id },
    });
  }

  async assertSatisfied(user: AuthenticatedUser, token: string): Promise<void> {
    const enrolment = await this.findEnrolment(user.id);
    const isEnrolled = enrolment !== null && enrolment.confirmedAt !== null;

    if (!isEnrolled) {
      if (await this.requirements.isRequiredFor(user.role)) {
        throw new TwoFactorEnrolmentRequiredException();
      }

      return;
    }

    if (!(await this.sessions.isVerified(user.id, token))) {
      throw new TwoFactorRequiredException();
    }
  }

  private findEnrolment(userId: string): Promise<StoredEnrolment | null> {
    return this.prisma.twoFactorEnrolment.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        secret: true,
        confirmedAt: true,
        lockedUntil: true,
      },
    });
  }

  private async requireEnrolment(userId: string): Promise<StoredEnrolment> {
    const enrolment = await this.findEnrolment(userId);

    if (enrolment === null) {
      throw new TwoFactorNotEnrolledException();
    }

    return enrolment;
  }

  private async requireConfirmedEnrolment(
    userId: string,
  ): Promise<StoredEnrolment> {
    const enrolment = await this.requireEnrolment(userId);

    if (enrolment.confirmedAt === null) {
      throw new TwoFactorNotEnrolledException();
    }

    return enrolment;
  }

  private countRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.twoFactorRecoveryCode.count({
      where: { userId, usedAt: null },
    });
  }

  private async replaceRecoveryCodes(
    user: AuthenticatedUser,
  ): Promise<string[]> {
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(
      codes.map((code) => hashRecoveryCode(code)),
    );

    await this.prisma.twoFactorRecoveryCode.deleteMany({
      where: { userId: user.id },
    });
    await this.prisma.twoFactorRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({
        tenantId: user.tenantId,
        userId: user.id,
        codeHash,
      })),
    });

    return codes;
  }
}
