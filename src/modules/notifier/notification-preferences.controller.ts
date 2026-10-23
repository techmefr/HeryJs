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
import { type RequestWithUser, SessionGuard } from '@heryjs/core/auth';
import { CapabilitiesGuard, Capability } from '@heryjs/core/capabilities';
import {
  ok,
  RateLimit,
  UnpaginatedRoute,
  ZodValidationPipe,
} from '@heryjs/core/http';
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
