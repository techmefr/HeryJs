import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { resolveSupportedLocales } from '#technical/i18n/locale.config';
import { recipientLocale } from '#technical/i18n/recipient-locale';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { authPrismaClient } from './better-auth.instance';
import { SessionGuard } from './session.guard';
import type { RequestWithUser } from './session.guard';
import { canManageOwnSessions } from './session.policy';

const accountLocaleSchema = z.object({
  locale: z
    .string()
    .refine((locale) => resolveSupportedLocales().includes(locale), {
      message: 'Not a locale this app supports.',
    }),
});

type AccountLocaleInput = z.infer<typeof accountLocaleSchema>;

/**
 * The language every message to this user is written in -- mail, SMS, push,
 * digests -- set at sign-up from the request and changed here. Distinct from
 * Accept-Language, which only decides the language of one response.
 */
@Controller('auth/locale')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class AccountLocaleController {
  @RateLimit('read')
  @UnpaginatedRoute('one user locale and the few locales the app supports')
  @Get()
  @Capability(canManageOwnSessions)
  async show(@Req() req: RequestWithUser) {
    const user = await authPrismaClient.user.findUnique({
      where: { id: req.user.id },
      select: { locale: true },
    });

    return ok({
      locale: recipientLocale(user),
      supported: resolveSupportedLocales(),
    });
  }

  @RateLimit('write')
  @Patch()
  @Capability(canManageOwnSessions)
  async update(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(accountLocaleSchema)) body: AccountLocaleInput,
  ) {
    await authPrismaClient.user.update({
      where: { id: req.user.id },
      data: { locale: body.locale },
    });

    return ok({ locale: body.locale });
  }
}
