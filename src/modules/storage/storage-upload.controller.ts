import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SessionGuard } from '#technical/auth/session.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ok } from '#technical/http/envelope';
import { storageEnv } from './storage.env';
import { canUploadFiles } from './storage-upload.policy';
import { StorageUploadRejectedException } from './storage-upload-rejected.exception';
import { StorageService } from './storage.service';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Controller('storage')
export class StorageUploadController {
  constructor(private readonly storage: StorageService) {}

  @RateLimit('write')
  @Post('upload')
  @UseGuards(SessionGuard, CapabilitiesGuard)
  @Capability(canUploadFiles)
  /**
   * The limit belongs to multer, not only to StorageService. multer buffers
   * the whole multipart body in memory first, so a cap applied afterwards
   * rejects a several-gigabyte upload only once it has already been held in
   * full -- a handful of concurrent requests is then enough to exhaust the
   * process, while the advertised limit looks enforced.
   *
   * One byte over is enough to stop reading: the service still re-checks the
   * size it received, because a direct .upload() call never passes through
   * this interceptor at all.
   */
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: storageEnv.STORAGE_MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(@UploadedFile() file: MulterFile | undefined) {
    if (!file) {
      throw new StorageUploadRejectedException(
        'no file part named "file" was sent',
      );
    }

    const stored = await this.storage.upload({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    });

    return ok(stored, ['File uploaded.']);
  }
}
