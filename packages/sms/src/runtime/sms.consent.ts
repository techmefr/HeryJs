import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';

/**
 * Consent is recorded per number, not per user, because the number is what a
 * regulator asks about and a number does not always belong to an account: a
 * contact form, an imported list, a delivery notification to someone who never
 * signed up. A boolean on User would answer for none of those.
 *
 * It is a log rather than a flag. "Is consent given" is a question the latest
 * row answers; "when, and through what" is a question only the history
 * answers, and it is the one that matters when someone complains.
 */
export type ConsentSource = 'form' | 'import' | 'api' | 'reply';

export interface ConsentDecision {
  granted: boolean;
  /** Absent when no record exists at all, which is not the same as a refusal. */
  recordedAt?: Date;
}

@Injectable()
export class SmsConsentService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async grant(phone: string, source: ConsentSource): Promise<void> {
    await this.writeDecision(phone, true, source);
  }

  /**
   * A revocation is a new row, never an update: overwriting the grant would
   * erase the evidence that consent was once given, which is exactly what a
   * dispute turns on.
   */
  async revoke(phone: string, source: ConsentSource): Promise<void> {
    await this.writeDecision(phone, false, source);
  }

  /**
   * The cast is the same one every generated service makes: the tenant-scoping
   * extension stamps tenantId on the way through, so the caller never supplies
   * it, while Prisma's generated input type still requires it.
   */
  private async writeDecision(
    phone: string,
    granted: boolean,
    source: ConsentSource,
  ): Promise<void> {
    await this.prisma.smsConsent.create({
      data: { phone, granted, source } as Prisma.SmsConsentUncheckedCreateInput,
    });
  }

  /**
   * Absence of a record is absence of consent. Treating "never asked" as
   * permission is the reading that ends in a fine, and it is the default a
   * hand-rolled implementation falls into by writing `?? true`.
   */
  async decisionFor(phone: string): Promise<ConsentDecision> {
    const latest = await this.prisma.smsConsent.findFirst({
      where: { phone },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (!latest) {
      return { granted: false };
    }

    return { granted: latest.granted, recordedAt: latest.createdAt };
  }
}
