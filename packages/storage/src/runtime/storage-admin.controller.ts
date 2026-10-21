import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#kernel/auth/session.guard';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { ok } from '#kernel/http/envelope';
import { UnpaginatedRoute } from '#kernel/http/unpaginated-route.decorator';
import { RateLimit } from '#kernel/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#kernel/validation/zod-validation.pipe';
import { allowedContentTypes, StorageService } from './storage.service';
import { StorageDriverRegistry } from './storage-driver.registry';
import { storageEnv } from './storage.env';
import { deleteFileSchema } from './storage-admin.dto';
import type { DeleteFileDto } from './storage-admin.dto';
import { canManageFiles } from './storage-admin.policy';

/**
 * What the admin panel reads and does, kept apart from `/storage` on purpose:
 * that controller owns `GET :key`, which would swallow a `GET /storage/files`
 * if the two shared a base path, and only exists on the local driver.
 */
@Controller('storage-admin')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class StorageAdminController {
  constructor(
    private readonly storage: StorageService,
    private readonly drivers: StorageDriverRegistry,
  ) {}

  @RateLimit('read')
  @UnpaginatedRoute(
    'one object holding the configured driver and the upload limits: there are no rows to page through',
  )
  @Get('status')
  @Capability(canManageFiles)
  status() {
    return ok({
      ...this.drivers.summary,
      maxUploadBytes: storageEnv.STORAGE_MAX_UPLOAD_BYTES,
      allowedContentTypes: allowedContentTypes(),
    });
  }

  @RateLimit('read')
  @UnpaginatedRoute(
    'capped at the first 200 objects under the tenant prefix, because an object store lists by continuation token rather than by page',
  )
  @Get('files')
  @Capability(canManageFiles)
  async files() {
    return ok(await this.storage.list());
  }

  @RateLimit('write')
  @Post('files/delete')
  @Capability(canManageFiles)
  async remove(
    @Body(new ZodValidationPipe(deleteFileSchema)) body: DeleteFileDto,
  ) {
    await this.storage.removeOwn(body.key);

    return ok({ key: body.key }, ['File deleted.']);
  }
}
