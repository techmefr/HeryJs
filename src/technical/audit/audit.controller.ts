import { once } from 'node:events';
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Capability } from '#technical/capabilities/capability.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { SessionGuard } from '#technical/auth/session.guard';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { parseAuditFilter } from './audit-filter';
import {
  AUDIT_CONTENT_TYPES,
  AUDIT_EXPORT_FORMATS,
  auditCsvHeader,
  auditLines,
} from './audit-format';
import { canExportAuditLog, canReadAuditLog } from './audit.policy';
import { exportQuerySchema } from './audit-sink.schema';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RateLimit('read')
  @Get()
  @Capability(canReadAuditLog)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.audit.page(
        TenantContextStorage.getTenantId(),
        page,
        parseAuditFilter(query),
      ),
      page,
    );
  }

  @UnpaginatedRoute('one verdict on the whole chain, not a collection')
  @RateLimit('read')
  @Get('verify')
  @Capability(canReadAuditLog)
  async verify() {
    const verification = await this.audit.verify(
      TenantContextStorage.getTenantId(),
    );

    return ok(verification);
  }

  @UnpaginatedRoute(
    'a file download streamed in batches, not a page of the envelope',
  )
  @RateLimit('read')
  @Get('export')
  @Capability(canExportAuditLog)
  async export(@Query() query: unknown, @Res() res: Response) {
    const parsed = exportQuerySchema.safeParse(query ?? {});

    if (!parsed.success) {
      throw new InvalidQueryException('format', AUDIT_EXPORT_FORMATS);
    }

    const { format } = parsed.data;
    const filter = parseAuditFilter(query);
    const tenantId = TenantContextStorage.getTenantId();

    await this.audit.recordExport(tenantId, format, filter);

    res.status(200);
    res.setHeader('Content-Type', AUDIT_CONTENT_TYPES[format]);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.${format}"`,
    );

    // Past this point the status line is gone, so a failure cannot become an
    // error response: the connection is destroyed instead, which a client
    // reads as a truncated download rather than as a complete file that
    // happens to stop early.
    try {
      if (format === 'csv') {
        res.write(auditCsvHeader());
      }

      for await (const batch of this.audit.exportBatches(tenantId, filter)) {
        if (res.destroyed) {
          return;
        }

        if (!res.write(auditLines(batch, format))) {
          await Promise.race([once(res, 'drain'), once(res, 'close')]);
        }
      }

      res.end();
    } catch (error) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
}
