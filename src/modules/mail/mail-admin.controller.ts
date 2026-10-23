import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  AdminAction,
  AdminSection,
  AdminStudio,
  ok,
  okPage,
  parsePageQuery,
  RateLimit,
  UnpaginatedRoute,
  ZodValidationPipe,
} from '@heryjs/core/http';
import { Capability } from '@heryjs/core/capabilities';
import { TenantContextStorage } from '@heryjs/core/tenancy';
import { MailDriverRegistry } from './mail-driver.registry';
import { canReadMailLog, canSendTestMail } from './mail.policy';
import { MailService } from './mail.service';
import { sendTestMailSchema } from './send-test-mail.dto';
import type { SendTestMailDto } from './send-test-mail.dto';
import { TestMail } from './test-mail.mailable';

/**
 * What the admin panel reads and does for mail, declared through the admin
 * contract rather than a page of its own. It is a controller apart from
 * `/mail` because that one carries a development-only route, and a controller
 * contributing to the admin must exist in production too.
 */
@Controller('mail-admin')
@AdminStudio()
export class MailAdminController {
  constructor(
    private readonly mail: MailService,
    private readonly drivers: MailDriverRegistry,
  ) {}

  @AdminSection({
    id: 'mail-drivers',
    title: 'Mail drivers',
    icon: 'mail',
    group: 'Messaging',
    order: 1,
    columns: [
      { key: 'driver', label: 'Driver' },
      { key: 'active', label: 'Active', format: 'boolean' },
    ],
  })
  @RateLimit('read')
  @UnpaginatedRoute(
    'one row per declared driver, a handful read from hery.config.ts: there is nothing to page through',
  )
  @Get('drivers')
  @Capability(canReadMailLog)
  driversList() {
    const { active, declared } = this.drivers.summary;

    return ok(
      declared.map((driver) => ({ driver, active: driver === active })),
    );
  }

  @RateLimit('read')
  @AdminSection({
    id: 'mail-sends',
    title: 'Recent sends',
    icon: 'mail',
    group: 'Messaging',
    order: 2,
    columns: [
      { key: 'to', label: 'To' },
      { key: 'subject', label: 'Subject' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'error', label: 'Error' },
      { key: 'createdAt', label: 'Queued', format: 'date' },
      { key: 'sentAt', label: 'Sent', format: 'date' },
    ],
  })
  @Get('sends')
  @Capability(canReadMailLog)
  async sends(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.mail.list(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  /**
   * Queues a message to an address the operator typed, through the same path
   * every mail takes, so the MailLog row it leaves is the proof the admin
   * shows: queued, then sent or failed with the driver's own error.
   */
  @RateLimit('write')
  @AdminAction({
    id: 'mail-send-test',
    title: 'Send test mail',
    icon: 'mail',
    section: 'mail-drivers',
    scope: 'global',
    fields: [{ name: 'to', label: 'Send to', type: 'text', required: true }],
  })
  @Post('test')
  @Capability(canSendTestMail)
  async sendTest(
    @Body(new ZodValidationPipe(sendTestMailSchema)) body: SendTestMailDto,
  ) {
    await this.mail.send(new TestMail(body.to));

    return ok({ to: body.to }, ['Test mail queued.']);
  }
}
