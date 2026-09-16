import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { canReadMailLog } from './mail.policy';
import { MailService } from './mail.service';
import { renderTemplate, templateNames } from './mail.templates';

@Controller('mail')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @RateLimit('read')
  @Get()
  @Capability(canReadMailLog)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.mail.list(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  @RateLimit('read')
  @Get('preview')
  @UseGuards(DevOnlyGuard)
  @Capability(canReadMailLog)
  previewIndex() {
    return { data: { templates: templateNames() } };
  }

  /**
   * Renders a template in the browser, so authoring a mail stops being a
   * matter of reading the HTML and imagining it. The log driver only ever
   * reported the recipient and the subject -- the body, the part being
   * written, was the one thing nothing showed.
   *
   * Behind DevOnlyGuard: it renders arbitrary templates with caller-supplied
   * values, which is a preview in development and an open rendering endpoint
   * anywhere else.
   */
  @RateLimit('read')
  @Get('preview/:template')
  @UseGuards(DevOnlyGuard)
  @Capability(canReadMailLog)
  @Header('content-type', 'text/html; charset=utf-8')
  preview(
    @Param('template') template: string,
    @Query() data: Record<string, string>,
  ): string {
    const { subject, html } = renderTemplate(template, data);

    // The subject travels with the body rather than in a header: it is half of
    // what is being previewed, and a preview that hides it lets a broken
    // subject ship unnoticed.
    return `<!doctype html><title>${subject}</title><p><strong>${subject}</strong></p><hr />${html}`;
  }
}
