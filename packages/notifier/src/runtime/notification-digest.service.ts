import { Inject, Injectable } from '@nestjs/common';
import { authPrismaClient } from '#kernel/public/auth';
import {
  recipientLocale,
  translateMessage as translated,
} from '#kernel/public/i18n';
import { notifierMailChannel } from '#kernel/public/notifications';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '#kernel/public/database';
import { runInTenant } from '#kernel/public/tenancy';
import { escapeHtml } from './escape-html';
import { localHour } from './local-time';
import { DEFAULT_SETTINGS } from './notification-rules';
import './notifier.catalogue';

const MAX_ENTRIES_PER_DIGEST = 500;

export interface DigestEntryInput {
  tenantId: string;
  userId: string;
  email: string;
  type: string;
  subject: string;
}

interface DigestRecipient {
  tenantId: string;
  userId: string;
}

@Injectable()
export class NotificationDigestService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async hold(entry: DigestEntryInput): Promise<void> {
    await authPrismaClient.notificationDigestEntry.create({ data: entry });
  }

  async flushDue(now: Date): Promise<number> {
    const recipients = await authPrismaClient.notificationDigestEntry.groupBy({
      by: ['tenantId', 'userId'],
    });
    let flushed = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const isFlushed = await runInTenant(recipient.tenantId, () =>
          this.flushRecipient(recipient, now),
        );

        flushed += isFlushed ? 1 : 0;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      throw new Error(`${failed} digest(s) could not be sent`);
    }

    return flushed;
  }

  private async flushRecipient(
    recipient: DigestRecipient,
    now: Date,
  ): Promise<boolean> {
    const channel = notifierMailChannel();

    if (!channel) {
      return false;
    }

    const settings =
      (await this.prisma.notificationSetting.findUnique({
        where: { userId: recipient.userId },
      })) ?? DEFAULT_SETTINGS;

    if (localHour(settings.timezone, now) !== settings.digestHour) {
      return false;
    }

    const entries = await authPrismaClient.notificationDigestEntry.findMany({
      where: { tenantId: recipient.tenantId, userId: recipient.userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_ENTRIES_PER_DIGEST,
    });
    const latest = entries[entries.length - 1];

    if (!latest) {
      return false;
    }

    const items = entries
      .map((entry) => `<li>${escapeHtml(entry.subject)}</li>`)
      .join('');
    const count = entries.length;
    const locale = recipientLocale(
      await authPrismaClient.user.findUnique({
        where: { id: recipient.userId },
        select: { locale: true },
      }),
    );
    const plural = new Intl.PluralRules(locale).select(count);
    const message = {
      to: latest.email,
      subject: translated(
        `notifications.digest.subject.${plural === 'one' ? 'one' : 'other'}`,
        { count },
        locale,
      ),
      html: `<p>${translated('notifications.digest.intro', {}, locale)}</p><ul>${items}</ul>`,
    };

    await channel.send({ to: latest.email, build: () => message });
    await authPrismaClient.notificationDigestEntry.deleteMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
    });

    return true;
  }
}
