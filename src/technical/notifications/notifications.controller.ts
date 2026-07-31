import {
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { NOTIFICATION_PROVIDER } from './notification.types';
import type { NotificationProvider } from './notification.types';

@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notifications: NotificationProvider,
  ) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    return ok(await this.notifications.listFor(req.user.id));
  }

  @Patch(':id/read')
  async markRead(@Req() req: RequestWithUser, @Param('id') id: string) {
    return ok(await this.notifications.markRead(id, req.user.id));
  }
}
