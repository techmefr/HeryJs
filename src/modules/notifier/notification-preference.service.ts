import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { NotifierChannel } from './notification';
import { DEFAULT_SETTINGS } from './notification-rules';
import type {
  NotificationRule,
  NotificationRules,
  NotificationSettings,
} from './notification-rules';

export interface NotificationRuleInput {
  channel: NotifierChannel;
  type: string;
  enabled: boolean;
  digest: boolean;
}

export interface NotificationSettingsInput {
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  digestHour: number;
}

@Injectable()
export class NotificationPreferenceService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async localeOf(userId: string): Promise<string | null> {
    const user = await authPrismaClient.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });

    return user?.locale ?? null;
  }

  async rulesFor(userId: string): Promise<NotificationRules> {
    const [rules, settings] = await Promise.all([
      this.listRules(userId),
      this.settingsFor(userId),
    ]);

    return { rules, settings };
  }

  async listRules(userId: string): Promise<NotificationRule[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ channel: 'asc' }, { type: 'asc' }],
    });

    return rows.map((row) => ({
      channel: row.channel as NotifierChannel,
      type: row.type,
      enabled: row.enabled,
      digest: row.digest,
    }));
  }

  async settingsFor(userId: string): Promise<NotificationSettings> {
    const row = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });

    if (!row) {
      return DEFAULT_SETTINGS;
    }

    return {
      timezone: row.timezone,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      digestHour: row.digestHour,
    };
  }

  async saveRules(
    userId: string,
    inputs: NotificationRuleInput[],
  ): Promise<NotificationRule[]> {
    await this.prisma.$transaction(
      inputs.map((input) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_channel_type: {
              userId,
              channel: input.channel,
              type: input.type,
            },
          },
          update: { enabled: input.enabled, digest: input.digest },
          create: {
            userId,
            channel: input.channel,
            type: input.type,
            enabled: input.enabled,
            digest: input.digest,
          } as Prisma.NotificationPreferenceUncheckedCreateInput,
        }),
      ),
    );

    return this.listRules(userId);
  }

  async resetRule(
    userId: string,
    channel: NotifierChannel,
    type: string,
  ): Promise<NotificationRule[]> {
    await this.prisma.notificationPreference.deleteMany({
      where: { userId, channel, type },
    });

    return this.listRules(userId);
  }

  async saveSettings(
    userId: string,
    input: NotificationSettingsInput,
  ): Promise<NotificationSettings> {
    await this.prisma.notificationSetting.upsert({
      where: { userId },
      update: input,
      create: {
        userId,
        ...input,
      } as Prisma.NotificationSettingUncheckedCreateInput,
    });

    return this.settingsFor(userId);
  }
}
