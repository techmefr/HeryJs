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
  @UseInterceptors(FileInterceptor('file'))
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
