import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '#technical/public/database';
import {
  PersonalDataRegistry,
  type PersonalDataSubject,
} from '#technical/public/privacy';

/**
 * Consent is kept per number, so the rows of a user are the ones of the number
 * the account holds. An account without a number has none.
 */
@Injectable()
export class SmsPersonalData implements OnModuleInit {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'SmsConsent',
      models: ['SmsConsent'],
      exportUser: async (subject) =>
        subject.phoneNumber === null
          ? []
          : this.prisma.smsConsent.findMany({
              where: this.ofNumber(subject),
              orderBy: { createdAt: 'asc' },
              select: {
                phone: true,
                granted: true,
                source: true,
                createdAt: true,
              },
            }),
      eraseUser: async (subject) =>
        subject.phoneNumber === null
          ? 0
          : (
              await this.prisma.smsConsent.deleteMany({
                where: this.ofNumber(subject),
              })
            ).count,
      eraseTenant: async (tenantId) =>
        (await this.prisma.smsConsent.deleteMany({ where: { tenantId } }))
          .count,
    });
  }

  private ofNumber(subject: PersonalDataSubject) {
    return { tenantId: subject.tenantId, phone: subject.phoneNumber ?? '' };
  }
}
