import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { NotificationPreferenceService } from './notification-preference.service';
import type {
  NotificationRuleInput,
  NotificationSettingsInput,
} from './notification-preference.service';
import { canManageOwnNotificationPreferences } from './notification-preferences.policy';
import {
  resetRuleParamsSchema,
  saveRulesSchema,
  saveSettingsSchema,
} from './notification-preferences.schemas';
import type { NotifierChannel } from './notification';

@Controller('notification-preferences')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferenceService) {}

  @UnpaginatedRoute(
    "one user's own preferences, bounded by channels and the types they set rules for",
  )
  @RateLimit('read')
  @Get()
  @Capability(canManageOwnNotificationPreferences)
  async show(@Req() req: RequestWithUser) {
    const { rules, settings } = await this.preferences.rulesFor(req.user.id);

    return ok({ rules, settings });
  }

  @RateLimit('write')
  @Put('rules')
  @Capability(canManageOwnNotificationPreferences)
  async saveRules(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(saveRulesSchema))
    body: { rules: NotificationRuleInput[] },
  ) {
    const rules = await this.preferences.saveRules(req.user.id, body.rules);

    return ok({ rules }, ['Notification preferences saved.']);
  }

  @RateLimit('write')
  @Delete('rules/:channel/:type')
  @Capability(canManageOwnNotificationPreferences)
  async resetRule(
    @Req() req: RequestWithUser,
    @Param(new ZodValidationPipe(resetRuleParamsSchema))
    params: { channel: NotifierChannel; type: string },
  ) {
    const rules = await this.preferences.resetRule(
      req.user.id,
      params.channel,
      params.type,
    );

    return ok({ rules }, ['Notification preference reset.']);
  }

  @RateLimit('write')
  @Put('settings')
  @Capability(canManageOwnNotificationPreferences)
  async saveSettings(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(saveSettingsSchema))
    body: NotificationSettingsInput,
  ) {
    const settings = await this.preferences.saveSettings(req.user.id, body);

    return ok({ settings }, ['Notification settings saved.']);
  }
}
